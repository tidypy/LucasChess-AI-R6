use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;
use tauri::RunEvent;

struct SidecarProcess(Mutex<Option<std::process::Child>>);

fn find_project_root() -> Option<PathBuf> {
    // Check current working dir
    if let Ok(cwd) = env::current_dir() {
        if cwd.join(".venv").exists() && cwd.join("core").exists() {
            return Some(cwd);
        }
        if let Some(parent) = cwd.parent() {
            if parent.join(".venv").exists() && parent.join("core").exists() {
                return Some(parent.to_path_buf());
            }
        }
    }

    // Check exe directory
    if let Ok(exe_path) = env::current_exe() {
        let mut cur = exe_path.parent();
        while let Some(dir) = cur {
            if dir.join(".venv").exists() && dir.join("core").exists() {
                return Some(dir.to_path_buf());
            }
            cur = dir.parent();
        }
    }

    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let root = find_project_root().unwrap_or_else(|| PathBuf::from("."));

            #[cfg(target_os = "windows")]
            let venv_python = root.join(".venv").join("Scripts").join("python.exe");

            #[cfg(not(target_os = "windows"))]
            let venv_python = root.join(".venv").join("bin").join("python");

            let python_bin = if venv_python.exists() {
                venv_python
            } else {
                PathBuf::from("python")
            };

            let sidecar_script = root.join("core").join("sidecar.py");

            println!("Starting Python sidecar...");
            println!("  Python binary: {:?}", python_bin);
            println!("  Sidecar script: {:?}", sidecar_script);
            println!("  Working dir: {:?}", root);

            let child = Command::new(&python_bin)
                .arg(&sidecar_script)
                .current_dir(&root)
                .spawn();

            match child {
                Ok(c) => {
                    println!("Python sidecar spawned successfully (PID: {})", c.id());
                    app.manage(SidecarProcess(Mutex::new(Some(c))));
                }
                Err(e) => {
                    eprintln!("Error: Failed to start Python sidecar at {:?}: {}", python_bin, e);
                }
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
