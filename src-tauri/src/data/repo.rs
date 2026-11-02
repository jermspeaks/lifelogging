use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use rusqlite::types::{Type, ValueRef};
use rusqlite::{Connection, Transaction, TransactionBehavior};
use serde_json::{Map, Number, Value};

use crate::data::model::{DataInfo, ExportResult};
use crate::error::{AppError, AppResult};

const PARTIAL_SUFFIX: &str = ".partial";
type TableColumns = (Vec<String>, Vec<(i64, String)>);

pub fn info(conn: &Connection, db_path: &Path) -> AppResult<DataInfo> {
    let size_bytes = match fs::metadata(db_path) {
        Ok(metadata) => i64::try_from(metadata.len())
            .map_err(|_| AppError::Database("database file is too large to report".into()))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => {
            return Err(AppError::Database(format!(
                "could not inspect database file {}: {error}",
                db_path.display()
            )));
        }
    };
    let schema_version = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    Ok(DataInfo {
        db_path: db_path.to_string_lossy().into_owned(),
        size_bytes,
        schema_version,
    })
}

pub fn export_database(conn: &Connection, path: &Path, db_path: &Path) -> AppResult<ExportResult> {
    let target = validate_target(path, db_path)?;
    let partial = partial_path(&target)?;
    remove_stale_partial(&partial)?;

    let partial_sql_path = partial.to_str().ok_or_else(|| {
        AppError::Validation("Export path must be representable as UTF-8.".into())
    })?;
    let escaped = partial_sql_path.replace('\'', "''");
    if let Err(error) = conn.execute_batch(&format!("VACUUM INTO '{escaped}'")) {
        let _ = fs::remove_file(&partial);
        return Err(error.into());
    }

    let result = finish_atomic_write(&partial, &target);
    if result.is_err() {
        let _ = fs::remove_file(&partial);
    }
    result?;
    export_result(target)
}

pub fn export_json(conn: &mut Connection, path: &Path, db_path: &Path) -> AppResult<ExportResult> {
    let target = validate_target(path, db_path)?;
    let partial = partial_path(&target)?;
    remove_stale_partial(&partial)?;

    let contents = {
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let export = json_export(&transaction)?;
        transaction.commit()?;
        serde_json::to_vec_pretty(&export).map_err(|error| {
            AppError::Database(format!("could not serialize JSON export: {error}"))
        })?
    };

    let result = write_atomic(&partial, &target, &contents);
    if result.is_err() {
        let _ = fs::remove_file(&partial);
    }
    result?;
    export_result(target)
}

fn json_export(transaction: &Transaction<'_>) -> AppResult<Value> {
    let schema_version: i64 =
        transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let exported_at = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut tables = Map::new();
    let table_names = {
        let mut statement = transaction.prepare(
            "SELECT name, sql FROM sqlite_master \
             WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' \
             ORDER BY name",
        )?;
        statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };

    for (table, create_sql) in table_names {
        let (column_names, primary_key) = table_columns(transaction, &table)?;
        let without_rowid = create_sql
            .as_deref()
            .is_some_and(|sql| sql.to_ascii_uppercase().contains("WITHOUT ROWID"));
        let order_by = if !without_rowid {
            ["_rowid_", "rowid", "oid"]
                .into_iter()
                .find(|candidate| {
                    !column_names
                        .iter()
                        .any(|name| name.eq_ignore_ascii_case(candidate))
                })
                .map(quote_identifier)
                .or_else(|| primary_key_order(&primary_key))
        } else {
            primary_key_order(&primary_key)
        };
        let order_by = order_by.ok_or_else(|| {
            AppError::Database(format!("table {table:?} has no deterministic row ordering"))
        })?;
        let sql = format!(
            "SELECT * FROM {} ORDER BY {order_by}",
            quote_identifier(&table)
        );
        let mut statement = transaction.prepare(&sql)?;
        let columns = statement
            .column_names()
            .iter()
            .map(|name| (*name).to_owned())
            .collect::<Vec<_>>();
        let mut rows = statement.query([])?;
        let mut exported_rows = Vec::new();
        while let Some(row) = rows.next()? {
            let mut values = Map::new();
            for (index, column) in columns.iter().enumerate() {
                values.insert(column.clone(), sqlite_value(row.get_ref(index)?, index)?);
            }
            exported_rows.push(Value::Object(values));
        }
        tables.insert(table, Value::Array(exported_rows));
    }

    Ok(serde_json::json!({
        "format": "lifelogging-export",
        "formatVersion": 1,
        "exportedAt": exported_at,
        "schemaVersion": schema_version,
        "tables": Value::Object(tables),
    }))
}

fn table_columns(transaction: &Transaction<'_>, table: &str) -> AppResult<TableColumns> {
    let mut statement =
        transaction.prepare(&format!("PRAGMA table_info({})", quote_identifier(table)))?;
    let columns = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let names = columns.iter().map(|(name, _)| name.clone()).collect();
    let mut primary_key = columns
        .into_iter()
        .filter(|(_, position)| *position > 0)
        .map(|(name, position)| (position, name))
        .collect::<Vec<_>>();
    primary_key.sort_by_key(|(position, _)| *position);
    Ok((names, primary_key))
}

fn primary_key_order(columns: &[(i64, String)]) -> Option<String> {
    (!columns.is_empty()).then(|| {
        columns
            .iter()
            .map(|(_, name)| quote_identifier(name))
            .collect::<Vec<_>>()
            .join(", ")
    })
}

fn sqlite_value(value: ValueRef<'_>, index: usize) -> rusqlite::Result<Value> {
    match value {
        ValueRef::Null => Ok(Value::Null),
        ValueRef::Integer(value) => Ok(Value::Number(value.into())),
        ValueRef::Real(value) => Number::from_f64(value).map(Value::Number).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                Type::Real,
                std::io::Error::other("SQLite REAL value is not finite").into(),
            )
        }),
        ValueRef::Text(value) => std::str::from_utf8(value)
            .map(|text| Value::String(text.to_owned()))
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(index, Type::Text, error.into())
            }),
        ValueRef::Blob(value) => Ok(Value::String(hex(value))),
    }
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(DIGITS[usize::from(byte >> 4)] as char);
        output.push(DIGITS[usize::from(byte & 0x0f)] as char);
    }
    output
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn validate_target(path: &Path, db_path: &Path) -> AppResult<PathBuf> {
    if !path.is_absolute() {
        return Err(AppError::Validation("Export path must be absolute.".into()));
    }
    let file_name = path
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| AppError::Validation("Export path must name a file.".into()))?;
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("Export path must have a parent directory.".into()))?;
    if !parent.is_dir() {
        return Err(AppError::Validation(
            "Export path's parent directory must already exist.".into(),
        ));
    }
    let canonical_parent = fs::canonicalize(parent).map_err(|error| {
        AppError::Validation(format!(
            "Export path's parent directory is unavailable: {error}"
        ))
    })?;
    let target = match fs::canonicalize(path) {
        Ok(canonical) => canonical,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            canonical_parent.join(file_name)
        }
        Err(error) => {
            return Err(AppError::Validation(format!(
                "Export target is unavailable: {error}"
            )));
        }
    };

    let live = resolved_path(db_path);
    let live_wal = resolved_path(&with_suffix(db_path, "-wal"));
    let live_shm = resolved_path(&with_suffix(db_path, "-shm"));
    if target == live
        || target == live_wal
        || target == live_shm
        || same_file(&target, db_path)
        || same_file(&target, &with_suffix(db_path, "-wal"))
        || same_file(&target, &with_suffix(db_path, "-shm"))
    {
        return Err(AppError::Validation(
            "Export path must not be the live database or its -wal/-shm file.".into(),
        ));
    }
    Ok(target)
}

fn resolved_path(path: &Path) -> PathBuf {
    if let Ok(canonical) = fs::canonicalize(path) {
        return canonical;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => fs::canonicalize(parent)
            .map(|parent| parent.join(name))
            .unwrap_or_else(|_| path.to_path_buf()),
        _ => path.to_path_buf(),
    }
}

#[cfg(unix)]
fn same_file(left: &Path, right: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(left), fs::metadata(right)) {
        (Ok(left), Ok(right)) => left.dev() == right.dev() && left.ino() == right.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn same_file(_left: &Path, _right: &Path) -> bool {
    false
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

fn partial_path(target: &Path) -> AppResult<PathBuf> {
    if target.to_str().is_none() {
        return Err(AppError::Validation(
            "Export path must be representable as UTF-8.".into(),
        ));
    }
    Ok(with_suffix(target, PARTIAL_SUFFIX))
}

fn remove_stale_partial(partial: &Path) -> AppResult<()> {
    match fs::remove_file(partial) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::Database(format!(
            "could not remove stale partial export {}: {error}",
            partial.display()
        ))),
    }
}

fn write_atomic(partial: &Path, target: &Path, contents: &[u8]) -> AppResult<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(partial)
        .map_err(|error| AppError::Database(format!("could not create partial export: {error}")))?;
    if let Err(error) = file.write_all(contents).and_then(|()| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(partial);
        return Err(AppError::Database(format!(
            "could not write export: {error}"
        )));
    }
    drop(file);
    finish_atomic_write(partial, target)
}

fn finish_atomic_write(partial: &Path, target: &Path) -> AppResult<()> {
    let file = OpenOptions::new()
        .read(true)
        .open(partial)
        .map_err(|error| {
            AppError::Database(format!("could not open completed partial export: {error}"))
        })?;
    file.sync_all()
        .map_err(|error| AppError::Database(format!("could not sync partial export: {error}")))?;
    drop(file);
    fs::rename(partial, target)
        .map_err(|error| AppError::Database(format!("could not finalize export: {error}")))
}

fn export_result(target: PathBuf) -> AppResult<ExportResult> {
    let metadata = fs::metadata(&target)
        .map_err(|error| AppError::Database(format!("could not inspect export: {error}")))?;
    let bytes = i64::try_from(metadata.len())
        .map_err(|_| AppError::Database("export is too large to report".into()))?;
    Ok(ExportResult {
        path: target.to_string_lossy().into_owned(),
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "lifelogging-data-test-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn snapshot_reopens_with_the_same_rows_and_replaces_stale_partial() {
        let directory = TempDir::new();
        let database_path = directory.path().join("live.db");
        let conn = db::open(&database_path).unwrap();
        conn.execute(
            "INSERT INTO habits (name, created_at, updated_at) VALUES ('Read', 'now', 'now')",
            [],
        )
        .unwrap();
        let output = directory.path().join("backup.db");
        fs::write(with_suffix(&output, PARTIAL_SUFFIX), "stale data").unwrap();

        let result = export_database(&conn, &output, &database_path).unwrap();
        assert_eq!(result.path, output.to_string_lossy());
        assert_eq!(result.bytes, fs::metadata(&output).unwrap().len() as i64);
        assert!(!with_suffix(&output, PARTIAL_SUFFIX).exists());

        let backup = db::open(&output).unwrap();
        let live_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM habits", [], |row| row.get(0))
            .unwrap();
        let backup_count: i64 = backup
            .query_row("SELECT COUNT(*) FROM habits", [], |row| row.get(0))
            .unwrap();
        assert_eq!(backup_count, live_count);
    }

    #[test]
    fn json_export_includes_all_tables_and_sqlite_value_types() {
        let directory = TempDir::new();
        let database_path = directory.path().join("live.db");
        let mut conn = db::open(&database_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE export_extra (id INTEGER PRIMARY KEY, integer_value, real_value, \
             text_value, blob_value, null_value); \
             CREATE TABLE export_without_rowid (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID; \
             INSERT INTO export_extra VALUES (2, 42, 3.5, 'text', X'00aBff', NULL); \
             INSERT INTO export_extra VALUES (1, -8, -0.25, 'first', X'', NULL); \
             INSERT INTO export_without_rowid VALUES ('z', 'last'), ('a', 'first'); \
             PRAGMA user_version = 23;",
        )
        .unwrap();
        let output = directory.path().join("data.json");

        let result = export_json(&mut conn, &output, &database_path).unwrap();
        let contents = fs::read_to_string(&output).unwrap();
        let export: Value = serde_json::from_str(&contents).unwrap();
        assert_eq!(result.bytes, contents.len() as i64);
        assert!(contents.starts_with("{\n  \""));
        assert_eq!(export["format"], "lifelogging-export");
        assert_eq!(export["formatVersion"], 1);
        assert_eq!(export["schemaVersion"], 23);
        assert!(export["exportedAt"].as_str().unwrap().contains('T'));
        assert!(export["tables"].get("habits").is_some());
        assert!(export["tables"].get("sqlite_sequence").is_none());
        assert_eq!(
            export["tables"]["export_extra"],
            json!([
                {
                    "id": 1,
                    "integer_value": -8,
                    "real_value": -0.25,
                    "text_value": "first",
                    "blob_value": "",
                    "null_value": null
                },
                {
                    "id": 2,
                    "integer_value": 42,
                    "real_value": 3.5,
                    "text_value": "text",
                    "blob_value": "00abff",
                    "null_value": null
                }
            ])
        );
        assert_eq!(
            export["tables"]["export_without_rowid"],
            json!([{"key": "a", "value": "first"}, {"key": "z", "value": "last"}])
        );
    }

    #[test]
    fn rejects_invalid_and_live_database_paths() {
        let directory = TempDir::new();
        let database_path = directory.path().join("live.db");
        let conn = db::open(&database_path).unwrap();
        assert!(matches!(
            validate_target(&database_path, &database_path),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            validate_target(Path::new("relative.json"), &database_path),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            validate_target(
                &directory.path().join("missing/export.json"),
                &database_path
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            validate_target(&with_suffix(&database_path, "-wal"), &database_path),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            validate_target(&with_suffix(&database_path, "-shm"), &database_path),
            Err(AppError::Validation(_))
        ));
        drop(conn);
    }

    #[test]
    fn info_reports_database_path_size_and_schema_version() {
        let directory = TempDir::new();
        let database_path = directory.path().join("live.db");
        let conn = db::open(&database_path).unwrap();
        let info = info(&conn, &database_path).unwrap();
        assert_eq!(info.db_path, database_path.to_string_lossy());
        assert_eq!(
            info.size_bytes as u64,
            fs::metadata(&database_path).unwrap().len()
        );
        assert_eq!(info.schema_version, 5);
    }
}
