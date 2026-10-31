mod db;
mod error;
mod habits;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Builder, Manager, Runtime};

use habits::commands;

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
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    with_commands(tauri::Builder::default())
        .setup(|app| {
            let path = db_path(app)?;
            let conn = db::open(&path)?;
            println!("lifelogging: database at {}", path.display());
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
        })
        .run(context())
        .expect("error while running tauri application");
}

/// Drives the real command handlers through Tauri's IPC layer (mock runtime), checking that the
/// camelCase argument names `src/lib/api.ts` sends deserialize into each command.
#[cfg(test)]
mod ipc_tests {
    use serde_json::{Value, json};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder};
    use tauri::webview::InvokeRequest;
    use tauri::{WebviewWindow, WebviewWindowBuilder};

    use super::*;

    fn app() -> WebviewWindow<tauri::test::MockRuntime> {
        let app = with_commands(mock_builder())
            .manage(db::Db(Mutex::new(db::open_in_memory().unwrap())))
            .build(context())
            .unwrap();
        WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap()
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
    }

    #[test]
    fn validation_errors_reach_the_webview_as_payloads() {
        let w = app();
        let err = invoke(&w, "create_habit", json!({ "input": { "name": "   " } })).unwrap_err();
        assert_eq!(err["kind"], "Validation");
        assert!(err["message"].is_string());
    }
}
