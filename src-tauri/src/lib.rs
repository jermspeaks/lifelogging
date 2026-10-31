mod db;
mod error;
mod habits;

use habits::commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // TODO(T5): in `.setup`, resolve LIFELOGGING_DB_PATH or app_data_dir()/lifelogging.db,
        // call `db::open`, and `app.manage(db::Db(Mutex::new(conn)))`.
        .invoke_handler(tauri::generate_handler![
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
