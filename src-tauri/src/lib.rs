use tauri::Manager;
use tauri::RunEvent;
use std::sync::Mutex;
use std::process::Command;

struct SidecarProcess(Mutex<Option<std::process::Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            let python_bin = "../.venv/Scripts/python.exe";
            #[cfg(not(target_os = "windows"))]
            let python_bin = "../.venv/bin/python";

            let child = Command::new(python_bin)
                .arg("../core/sidecar.py")
                .spawn();

            if let Ok(c) = child {
                app.manage(SidecarProcess(Mutex::new(Some(c))));
            } else {
                eprintln!("Warning: Failed to start Python sidecar");
            }
            
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, e| match e {
        RunEvent::Exit => {
            if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                if let Ok(mut process) = state.0.lock() {
                    if let Some(mut child) = process.take() {
                        println!("Killing Python sidecar...");
                        let _ = child.kill();
                    }
                }
            }
        }
        _ => {}
    });
}
