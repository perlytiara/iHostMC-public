mod api;
mod commands;
mod dev_auth_server;
mod download;
mod java;
mod process;
mod server;
mod slp;
mod test_server;
mod tunnel;
mod upnp;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init());
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(
                |_app, argv, _cwd| {
                    let _ = argv;
                },
            ))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![]),
            ));
    }
    builder
        .invoke_handler(tauri::generate_handler![
            commands::get_run_in_background,
            commands::set_run_in_background,
            commands::get_idle_slideshow,
            commands::set_idle_slideshow,
            commands::quit_app,
            commands::list_servers,
            commands::get_server_ports,
            commands::create_server,
            commands::archive_server,
            commands::unarchive_server,
            commands::trash_server,
            commands::restore_server,
            commands::delete_server,
            commands::start_server,
            commands::stop_server,
            commands::send_server_input,
            commands::get_server_status,
            commands::get_running_server_id,
            commands::get_server_stats,
            commands::get_versions_vanilla,
            commands::get_versions_paper,
            commands::get_versions_purpur,
            commands::get_versions_fabric,
            commands::get_versions_fabric_loader,
            commands::get_versions_fabric_installer,
            commands::get_versions_spigot,
            commands::get_versions_bukkit,
            commands::get_versions_forge,
            commands::get_versions_forge_builds,
            commands::get_versions_neoforge,
            commands::get_versions_neoforge_for_game,
            commands::get_versions_quilt,
            commands::get_versions_quilt_loader,
            commands::get_quilt_installer_url,
            commands::get_versions_fabric_loader_for_game,
            commands::get_system_ram_mb,
            commands::get_java_paths,
            commands::download_java,
            commands::search_modrinth_mods,
            commands::search_modrinth_plugins,
            commands::search_spiget_plugins,
            commands::install_modrinth_mod,
            commands::install_modrinth_plugin,
            commands::install_spiget_plugin,
            commands::search_curseforge_mods,
            commands::search_curseforge_plugins,
            commands::install_curseforge_mod,
            commands::install_curseforge_plugin,
            commands::get_curseforge_api_key,
            commands::set_curseforge_api_key,
            commands::list_server_files,
            commands::scan_server_files_for_backup,
            commands::read_server_file,
            commands::write_server_file,
            commands::open_server_folder,
            commands::get_test_control_url,
            commands::rename_server,
            commands::open_devtools,
            commands::ping_minecraft_server,
            commands::add_windows_firewall_rule,
            commands::get_public_ip,
            commands::test_frp_connection,
            tunnel::start_tunnel,
            tunnel::stop_tunnel,
            tunnel::get_tunnel_public_url,
            commands::try_upnp_forward,
            commands::remove_upnp_if_active,
            commands::set_server_online_mode_for_relay,
            commands::build_sync_manifest,
            commands::sync_mini_files,
        ])
        .manage(tunnel::TunnelState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let run_in_background = server::load_preferences().run_in_background;
                if run_in_background {
                    api.prevent_close();
                    let _ = window.hide();
                } else if process::is_running() {
                    api.prevent_close();
                    let _ =
                        window.emit("close-requested", serde_json::json!({ "runningCount": 1 }));
                }
            }
        })
        .setup(|app| {
            // System tray with app icon
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;
            use tauri::Manager;

            let show_item = MenuItemBuilder::with_id("show", "Show iHostMC").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Exit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/32x32.png"))
                .menu(&tray_menu)
                .tooltip("iHostMC")
                .on_menu_event(move |app_handle, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app_handle.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            tauri::async_runtime::spawn(async move {
                server::ensure_app_dirs().await;
            });
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    dev_auth_server::run(app_handle).await;
                });
            }
            if test_server::should_run() {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    test_server::run(app_handle).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            let msg = format!("Tauri run error: {e}");
            write_crash_log(&msg);
            panic!("{msg}");
        });
}

/// Writes a crash/error line to the app log file. Returns true if written to file, false otherwise.
pub fn write_crash_log(msg: &str) -> bool {
    let dir = crash_log_dir();
    if let Some(dir) = dir {
        if std::fs::create_dir_all(&dir).is_ok() {
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("crash.log"))
            {
                use std::io::Write;
                return writeln!(f, "{msg}").is_ok();
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        eprintln!("{msg}");
    }
    false
}

/// Returns the app data/config directory for crash logs. Cross-platform.
fn crash_log_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(std::path::PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| {
            std::path::Path::new(&h)
                .join("Library")
                .join("Application Support")
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(|h| std::path::Path::new(&h).join(".config"))
            })
    }
    #[cfg(not(any(windows, target_os = "macos", unix)))]
    {
        let _ = std::env::var_os("HOME");
        None
    }
    .map(|p| p.join("com.ihostmc.desktop"))
}
