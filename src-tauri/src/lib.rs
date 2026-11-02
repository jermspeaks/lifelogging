mod calendar;
mod data;
mod dates;
mod db;
mod error;
mod goals;
mod habits;
mod journal;
mod notes;
mod quotes;
mod reminders;
mod themes;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Builder, Manager, Runtime};

use calendar::commands as calendar_commands;
use data::commands as data_commands;
use goals::commands as goal_commands;
use habits::commands;
use journal::commands as journal_commands;
use notes::commands as note_commands;
use quotes::commands as quote_commands;
use reminders::commands as reminder_commands;
use themes::commands as theme_commands;

/// Overrides the database location (dev/testing). Default: `<app_data_dir>/lifelogging.db`.
const DB_PATH_ENV: &str = "LIFELOGGING_DB_PATH";

fn db_path(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Some(path) = std::env::var_os(DB_PATH_ENV).filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    Ok(app.path().app_data_dir()?.join("lifelogging.db"))
}

/// The app's config and capabilities. Expanded once (embeds Info.plist), shared with tests.
fn context<R: Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

/// Registers every command; shared by the app and the IPC tests.
fn with_commands<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::list_habits,
        commands::get_habit,
        commands::create_habit,
        commands::update_habit,
        commands::archive_habit,
        commands::unarchive_habit,
        commands::delete_habit,
        commands::reorder_habits,
        commands::set_habit_check,
        commands::get_today,
        calendar_commands::list_calendars,
        calendar_commands::import_calendar,
        calendar_commands::delete_calendar,
        calendar_commands::get_upcoming_events,
        journal_commands::get_journal_entry,
        journal_commands::save_journal_entry,
        journal_commands::delete_journal_entry,
        journal_commands::list_journal_entries,
        theme_commands::list_themes,
        theme_commands::get_theme,
        theme_commands::set_theme,
        theme_commands::delete_theme,
        quote_commands::list_quotes,
        quote_commands::create_quote,
        quote_commands::update_quote,
        quote_commands::delete_quote,
        quote_commands::import_quotes,
        quote_commands::get_daily_quote,
        data_commands::get_data_info,
        data_commands::export_database,
        data_commands::export_json,
        reminder_commands::list_reminders,
        reminder_commands::get_due_reminders,
        reminder_commands::create_reminder,
        reminder_commands::update_reminder,
        reminder_commands::set_reminder_done,
        reminder_commands::delete_reminder,
        note_commands::list_notes,
        note_commands::create_note,
        note_commands::update_note,
        note_commands::review_note,
        note_commands::set_note_archived,
        note_commands::delete_note,
        note_commands::get_review_queue,
        goal_commands::list_goals,
        goal_commands::create_goal,
        goal_commands::update_goal,
        goal_commands::set_goal_status,
        goal_commands::delete_goal,
        goal_commands::reorder_goals,
        goal_commands::log_goal_progress,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    with_commands(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = db_path(app)?;
            let conn = db::open(&path)?;
            println!("lifelogging: database at {}", path.display());
            app.manage(db::Db(Mutex::new(conn)));
            app.manage(db::DbPath(path));
            Ok(())
        })
        .run(context())
        .expect("error while running tauri application");
}

/// Drives the real command handlers through Tauri's IPC layer (mock runtime), checking that the
/// camelCase argument names `src/lib/api.ts` sends deserialize into each command.
#[cfg(test)]
mod ipc_tests {
    use std::fs;
    use std::ops::Deref;
    use std::sync::atomic::{AtomicU64, Ordering};

    use serde_json::{Value, json};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder};
    use tauri::webview::InvokeRequest;
    use tauri::{WebviewWindow, WebviewWindowBuilder};

    use super::*;

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            static NEXT_ID: AtomicU64 = AtomicU64::new(0);

            for _ in 0..100 {
                let path = std::env::temp_dir().join(format!(
                    "lifelogging-ipc-{}-{}",
                    std::process::id(),
                    NEXT_ID.fetch_add(1, Ordering::Relaxed)
                ));
                match fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!(
                        "could not create test directory {}: {error}",
                        path.display()
                    ),
                }
            }
            panic!("could not allocate a unique IPC test directory");
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    struct TestApp {
        window: WebviewWindow<tauri::test::MockRuntime>,
        _temp_dir: TestDir,
        db_path: PathBuf,
    }

    impl Deref for TestApp {
        type Target = WebviewWindow<tauri::test::MockRuntime>;

        fn deref(&self) -> &Self::Target {
            &self.window
        }
    }

    fn app() -> TestApp {
        let temp_dir = TestDir::new();
        let db_path = temp_dir.0.join("lifelogging.db");
        let app = with_commands(mock_builder())
            .manage(db::Db(Mutex::new(db::open(&db_path).unwrap())))
            .manage(db::DbPath(db_path.clone()))
            .build(context())
            .unwrap();
        let window = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        TestApp {
            window,
            _temp_dir: temp_dir,
            db_path,
        }
    }

    fn invoke(
        webview: &WebviewWindow<tauri::test::MockRuntime>,
        cmd: &str,
        args: Value,
    ) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                // The macOS/Linux app origin; a non-app origin is treated as remote and denied.
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    #[test]
    fn every_command_round_trips_over_ipc() {
        let w = app();
        let today = chrono::Local::now()
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();

        let read = invoke(
            &w,
            "create_habit",
            json!({ "input": { "name": "Read", "color": "blue" } }),
        )
        .unwrap();
        let walk = invoke(
            &w,
            "create_habit",
            json!({ "input": { "name": "Walk", "scheduleDays": 96 } }),
        )
        .unwrap();
        let (read_id, walk_id) = (read["id"].clone(), walk["id"].clone());
        assert_eq!(read["scheduleDays"], 127);
        assert_eq!(walk["scheduleDays"], 96);

        let updated = invoke(&w, "update_habit", json!({ "id": read_id, "patch": { "name": "Read 20 pages", "description": "classics" } })).unwrap();
        assert_eq!(updated["name"], "Read 20 pages");
        assert_eq!(
            invoke(&w, "get_habit", json!({ "id": read_id })).unwrap()["description"],
            "classics"
        );

        invoke(&w, "reorder_habits", json!({ "ids": [walk_id, read_id] })).unwrap();
        let listed = invoke(&w, "list_habits", json!({ "includeArchived": false })).unwrap();
        assert_eq!(listed[0]["id"], walk_id);

        let row = invoke(
            &w,
            "set_habit_check",
            json!({ "habitId": read_id, "date": today, "today": today, "done": true }),
        )
        .unwrap();
        assert_eq!(row["doneToday"], true);
        assert_eq!(row["currentStreak"], 1);
        assert_eq!(row["last7"].as_array().unwrap().len(), 7);

        let rows = invoke(&w, "get_today", json!({ "today": today })).unwrap();
        assert_eq!(rows.as_array().unwrap().len(), 2);

        assert!(
            invoke(&w, "archive_habit", json!({ "id": walk_id })).unwrap()["archivedAt"]
                .is_string()
        );
        assert_eq!(
            invoke(&w, "list_habits", json!({ "includeArchived": true }))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            invoke(&w, "get_today", json!({ "today": today }))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(
            invoke(&w, "unarchive_habit", json!({ "id": walk_id })).unwrap()["archivedAt"]
                .is_null()
        );

        invoke(&w, "delete_habit", json!({ "id": walk_id })).unwrap();
        let err = invoke(&w, "get_habit", json!({ "id": walk_id })).unwrap_err();
        assert_eq!(err["kind"], "NotFound");

        let ics = format!(
            "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:today-event\r\nDTSTART;VALUE=DATE:{}\r\nSUMMARY:Today event\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
            today.replace('-', "")
        );
        let imported = invoke(
            &w,
            "import_calendar",
            json!({ "name": "Personal", "content": ics }),
        )
        .unwrap();
        let calendar_id = imported["calendar"]["id"].clone();
        assert_eq!(imported["importedEventCount"], 1);
        assert_eq!(
            invoke(&w, "list_calendars", json!({})).unwrap()[0]["name"],
            "Personal"
        );
        let events = invoke(&w, "get_upcoming_events", json!({ "today": today })).unwrap();
        assert_eq!(events[0]["summary"], "Today event");
        invoke(&w, "delete_calendar", json!({ "id": calendar_id })).unwrap();
        assert!(
            invoke(&w, "list_calendars", json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn v03_commands_round_trip_over_ipc() {
        let w = app();
        let today = chrono::Local::now()
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();

        let journal = invoke(
            &w,
            "save_journal_entry",
            json!({ "date": today, "today": today, "body": "  v0.3 journal entry  " }),
        )
        .unwrap();
        assert_eq!(journal["date"], today);
        assert_eq!(journal["body"], "  v0.3 journal entry  ");
        assert_eq!(journal["wordCount"], 3);
        assert!(journal["createdAt"].is_string());
        assert!(journal["updatedAt"].is_string());

        let fetched = invoke(
            &w,
            "get_journal_entry",
            json!({ "date": today, "today": today }),
        )
        .unwrap();
        assert_eq!(fetched, journal);
        let entries = invoke(
            &w,
            "list_journal_entries",
            json!({ "query": "v0.3", "limit": 10 }),
        )
        .unwrap();
        assert_eq!(entries.as_array().unwrap().len(), 1);
        assert_eq!(entries[0]["preview"], "v0.3 journal entry");
        assert_eq!(entries[0]["wordCount"], 3);
        assert!(entries[0]["updatedAt"].is_string());

        assert!(
            invoke(&w, "list_themes", json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert!(
            invoke(&w, "get_theme", json!({ "year": 2026 }))
                .unwrap()
                .is_null()
        );
        let theme = invoke(
            &w,
            "set_theme",
            json!({ "year": 2026, "input": { "title": "Year of Practice", "description": "Build steadily" } }),
        )
        .unwrap();
        assert_eq!(theme["year"], 2026);
        assert_eq!(theme["title"], "Year of Practice");
        assert_eq!(theme["description"], "Build steadily");
        assert!(theme["createdAt"].is_string());
        assert!(theme["updatedAt"].is_string());
        assert_eq!(
            invoke(&w, "get_theme", json!({ "year": 2026 })).unwrap(),
            theme
        );
        assert_eq!(invoke(&w, "list_themes", json!({})).unwrap()[0], theme);

        assert!(
            invoke(&w, "list_quotes", json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
        let quote = invoke(
            &w,
            "create_quote",
            json!({ "input": { "text": "First quote", "author": "Ada", "source": "Notes" } }),
        )
        .unwrap();
        let quote_id = quote["id"].clone();
        assert!(quote_id.as_i64().is_some());
        assert_eq!(quote["text"], "First quote");
        assert_eq!(quote["author"], "Ada");
        assert_eq!(quote["source"], "Notes");
        assert!(quote["createdAt"].is_string());
        assert!(quote["updatedAt"].is_string());

        let updated_quote = invoke(
            &w,
            "update_quote",
            json!({ "id": quote_id, "patch": { "text": "Updated quote", "author": "Ada", "source": "Collected" } }),
        )
        .unwrap();
        assert_eq!(updated_quote["text"], "Updated quote");
        assert_eq!(updated_quote["author"], "Ada");
        assert_eq!(updated_quote["source"], "Collected");
        assert!(updated_quote["updatedAt"].is_string());
        assert_eq!(
            invoke(&w, "list_quotes", json!({})).unwrap()[0],
            updated_quote
        );

        let imported = invoke(
            &w,
            "import_quotes",
            json!({ "text": "New quote — Grace\nUPDATED QUOTE — Ada" }),
        )
        .unwrap();
        assert_eq!(imported["imported"], 1);
        assert_eq!(imported["skipped"], 1);
        let daily = invoke(&w, "get_daily_quote", json!({ "today": today })).unwrap();
        assert!(daily["id"].as_i64().is_some());
        assert!(daily["text"].is_string());
        assert!(daily.get("author").is_some());
        assert!(daily.get("source").is_some());
        assert!(daily["createdAt"].is_string());
        assert!(daily["updatedAt"].is_string());
        assert_eq!(
            invoke(&w, "delete_quote", json!({ "id": quote_id })).unwrap(),
            Value::Null
        );
        let remaining_quotes = invoke(&w, "list_quotes", json!({})).unwrap();
        assert_eq!(remaining_quotes.as_array().unwrap().len(), 1);
        assert_eq!(remaining_quotes[0]["text"], "New quote");

        let info = invoke(&w, "get_data_info", json!({})).unwrap();
        assert_eq!(info["dbPath"], w.db_path.to_string_lossy().as_ref());
        assert!(info["sizeBytes"].as_i64().is_some_and(|bytes| bytes > 0));
        assert_eq!(info["schemaVersion"], 8);

        let database_export_path = w._temp_dir.0.join("snapshot.db");
        let database_export = invoke(
            &w,
            "export_database",
            json!({ "path": database_export_path.to_string_lossy() }),
        )
        .unwrap();
        assert_eq!(
            database_export["path"],
            database_export_path.to_string_lossy().as_ref()
        );
        assert!(
            database_export["bytes"]
                .as_i64()
                .is_some_and(|bytes| bytes > 0)
        );
        assert_eq!(
            database_export["bytes"],
            fs::metadata(&database_export_path).unwrap().len()
        );
        let snapshot = rusqlite::Connection::open(&database_export_path).unwrap();
        let journal_rows: i64 = snapshot
            .query_row("SELECT COUNT(*) FROM journal_entries", [], |row| row.get(0))
            .unwrap();
        let theme_rows: i64 = snapshot
            .query_row("SELECT COUNT(*) FROM annual_themes", [], |row| row.get(0))
            .unwrap();
        let quote_rows: i64 = snapshot
            .query_row("SELECT COUNT(*) FROM quotes", [], |row| row.get(0))
            .unwrap();
        assert_eq!((journal_rows, theme_rows, quote_rows), (1, 1, 1));

        let json_export_path = w._temp_dir.0.join("data.json");
        let json_export = invoke(
            &w,
            "export_json",
            json!({ "path": json_export_path.to_string_lossy() }),
        )
        .unwrap();
        assert_eq!(
            json_export["path"],
            json_export_path.to_string_lossy().as_ref()
        );
        assert!(json_export["bytes"].as_i64().is_some_and(|bytes| bytes > 0));
        assert_eq!(
            json_export["bytes"],
            fs::metadata(&json_export_path).unwrap().len()
        );
        let exported: Value =
            serde_json::from_slice(&fs::read(&json_export_path).unwrap()).unwrap();
        assert_eq!(exported["format"], "lifelogging-export");
        assert_eq!(exported["formatVersion"], 1);
        assert_eq!(exported["schemaVersion"], 8);
        assert!(exported["exportedAt"].as_str().is_some());
        assert_eq!(
            exported["tables"]["journal_entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            exported["tables"]["journal_entries"][0]["body"],
            "  v0.3 journal entry  "
        );
        assert_eq!(
            exported["tables"]["annual_themes"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            exported["tables"]["annual_themes"][0]["title"],
            "Year of Practice"
        );
        assert_eq!(exported["tables"]["quotes"].as_array().unwrap().len(), 1);
        assert_eq!(exported["tables"]["quotes"][0]["text"], "New quote");

        assert_eq!(
            invoke(&w, "delete_journal_entry", json!({ "date": today })).unwrap(),
            Value::Null
        );
        assert!(
            invoke(
                &w,
                "get_journal_entry",
                json!({ "date": today, "today": today })
            )
            .unwrap()
            .is_null()
        );
        assert_eq!(
            invoke(&w, "delete_theme", json!({ "year": 2026 })).unwrap(),
            Value::Null
        );
        assert!(
            invoke(&w, "get_theme", json!({ "year": 2026 }))
                .unwrap()
                .is_null()
        );
    }

    #[test]
    fn v04_commands_round_trip_over_ipc() {
        let w = app();
        let today = chrono::Local::now()
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();

        let reminder = invoke(
            &w,
            "create_reminder",
            json!({
                "input": {
                    "title": "Call the dentist",
                    "notes": "Ask about the appointment",
                    "dueDate": today,
                    "dueTime": "09:30"
                }
            }),
        )
        .unwrap();
        let reminder_id = reminder["id"].clone();
        assert_eq!(reminder["title"], "Call the dentist");
        assert_eq!(
            invoke(
                &w,
                "list_reminders",
                json!({ "today": today, "includeCompleted": false })
            )
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
            1
        );
        assert_eq!(
            invoke(&w, "get_due_reminders", json!({ "today": today })).unwrap()[0]["id"],
            reminder_id
        );
        let reminder = invoke(
            &w,
            "update_reminder",
            json!({ "id": reminder_id, "patch": { "dueTime": "" } }),
        )
        .unwrap();
        assert!(reminder["dueTime"].is_null());
        assert_eq!(
            invoke(
                &w,
                "set_reminder_done",
                json!({ "id": reminder_id, "today": today, "done": true })
            )
            .unwrap()["completedOn"],
            today
        );
        assert_eq!(
            invoke(
                &w,
                "list_reminders",
                json!({ "today": today, "includeCompleted": true })
            )
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
            1
        );
        assert!(
            invoke(
                &w,
                "set_reminder_done",
                json!({ "id": reminder_id, "today": today, "done": false })
            )
            .unwrap()["completedOn"]
                .is_null()
        );
        assert_eq!(
            invoke(&w, "delete_reminder", json!({ "id": reminder_id })).unwrap(),
            Value::Null
        );

        let note = invoke(
            &w,
            "create_note",
            json!({
                "input": {
                    "title": "Read later",
                    "body": "A useful page",
                    "url": "https://example.test/article"
                },
                "today": today
            }),
        )
        .unwrap();
        let note_id = note["id"].clone();
        assert_eq!(note["reviewStage"], 0);
        assert_eq!(
            invoke(
                &w,
                "list_notes",
                json!({ "query": "useful", "includeArchived": false })
            )
            .unwrap()[0]["id"],
            note_id
        );
        assert!(
            invoke(
                &w,
                "get_review_queue",
                json!({ "today": today, "limit": 5 })
            )
            .unwrap()["due"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            invoke(
                &w,
                "review_note",
                json!({ "id": note_id, "today": today, "action": "keep" })
            )
            .unwrap()["reviewStage"],
            1
        );
        let note = invoke(
            &w,
            "update_note",
            json!({ "id": note_id, "patch": { "title": "A page to revisit" } }),
        )
        .unwrap();
        assert_eq!(note["title"], "A page to revisit");
        assert!(
            invoke(
                &w,
                "set_note_archived",
                json!({ "id": note_id, "archived": true, "today": today })
            )
            .unwrap()["nextReviewDate"]
                .is_null()
        );
        assert!(
            invoke(
                &w,
                "set_note_archived",
                json!({ "id": note_id, "archived": false, "today": today })
            )
            .unwrap()["nextReviewDate"]
                .is_string()
        );
        assert_eq!(
            invoke(&w, "delete_note", json!({ "id": note_id })).unwrap(),
            Value::Null
        );

        let numeric = invoke(
            &w,
            "create_goal",
            json!({
                "input": {
                    "title": "Read ten books",
                    "targetValue": 10,
                    "unit": "books",
                    "dueDate": today
                }
            }),
        )
        .unwrap();
        let milestone = invoke(
            &w,
            "create_goal",
            json!({ "input": { "title": "Run a half marathon" } }),
        )
        .unwrap();
        let numeric_id = numeric["id"].clone();
        let milestone_id = milestone["id"].clone();
        assert_eq!(
            invoke(
                &w,
                "log_goal_progress",
                json!({ "goalId": numeric_id, "date": today, "today": today, "amount": 4 })
            )
            .unwrap()["todayAmount"],
            4.0
        );
        let goals = invoke(
            &w,
            "list_goals",
            json!({ "today": today, "includeClosed": false }),
        )
        .unwrap();
        assert_eq!(goals[0]["percent"], 40);
        assert_eq!(goals[0]["daysLeft"], 0);
        let updated_goal = invoke(
            &w,
            "update_goal",
            json!({ "id": numeric_id, "patch": { "description": "Make steady progress" } }),
        )
        .unwrap();
        assert_eq!(updated_goal["description"], "Make steady progress");
        assert_eq!(
            invoke(
                &w,
                "set_goal_status",
                json!({ "id": milestone_id, "status": "completed", "today": today })
            )
            .unwrap()["closedOn"],
            today
        );
        assert_eq!(
            invoke(
                &w,
                "list_goals",
                json!({ "today": today, "includeClosed": true })
            )
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
            2
        );
        assert!(
            invoke(
                &w,
                "set_goal_status",
                json!({ "id": milestone_id, "status": "active", "today": today })
            )
            .unwrap()["closedOn"]
                .is_null()
        );
        assert_eq!(
            invoke(
                &w,
                "reorder_goals",
                json!({ "ids": [milestone_id, numeric_id] })
            )
            .unwrap(),
            Value::Null
        );
        assert_eq!(
            invoke(
                &w,
                "list_goals",
                json!({ "today": today, "includeClosed": false })
            )
            .unwrap()[0]["goal"]["id"],
            milestone_id
        );
        assert_eq!(
            invoke(&w, "delete_goal", json!({ "id": milestone_id })).unwrap(),
            Value::Null
        );
        assert_eq!(
            invoke(&w, "delete_goal", json!({ "id": numeric_id })).unwrap(),
            Value::Null
        );
    }

    #[test]
    fn validation_errors_reach_the_webview_as_payloads() {
        let w = app();
        let err = invoke(&w, "create_habit", json!({ "input": { "name": "   " } })).unwrap_err();
        assert_eq!(err["kind"], "Validation");
        assert!(err["message"].is_string());
    }
}
