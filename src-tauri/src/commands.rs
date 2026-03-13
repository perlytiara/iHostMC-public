use crate::api;
use crate::download;
use crate::java;
use crate::process;
use crate::server::{self, ServerConfig, ServerType};
use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use uuid::Uuid;

const SERVER_PROPERTIES_NAME: &str = "server.properties";

/// Write or update a single property in server.properties. Creates file if missing.
fn set_server_property(server_dir: &Path, key: &str, value: &str) -> Result<(), String> {
    let path: PathBuf = server_dir.join(SERVER_PROPERTIES_NAME);
    let new_line = format!("{}={}\n", key, value);
    let content = if path.exists() {
        let f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = BufReader::new(f)
            .lines()
            .map(|r| r.unwrap_or_default())
            .collect();
        let mut found = false;
        for line in lines.iter_mut() {
            if line.trim_start().starts_with(&format!("{}=", key)) {
                *line = new_line.trim_end().to_string();
                found = true;
                break;
            }
        }
        if !found {
            lines.push(new_line.trim_end().to_string());
        }
        lines.join("\n") + "\n"
    } else {
        new_line
    };
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Set online-mode in server.properties so players connecting via the relay don't get "Invalid session".
/// Minecraft validates sessions with Mojang; through the relay the server sees the tunnel IP and validation fails.
/// Call when enabling Share server so external clients can connect.
#[tauri::command]
pub fn set_server_online_mode_for_relay(server_id: String) -> Result<(), String> {
    let servers = server::list_servers();
    let config = servers
        .into_iter()
        .find(|c| c.id == server_id)
        .ok_or_else(|| "Server not found".to_string())?;
    set_server_property(&config.path, "online-mode", "false")?;
    Ok(())
}

/// Write or update server.properties so server-port is set. Minecraft reads this on start.
fn set_server_port(server_dir: &Path, port: u16) -> Result<(), String> {
    let path: PathBuf = server_dir.join(SERVER_PROPERTIES_NAME);
    let port_line = format!("server-port={}\n", port);
    let content = if path.exists() {
        let f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = BufReader::new(f)
            .lines()
            .map(|r| r.unwrap_or_default())
            .collect();
        let mut found = false;
        for line in lines.iter_mut() {
            if line.trim_start().starts_with("server-port=") {
                *line = port_line.trim_end().to_string();
                found = true;
                break;
            }
        }
        if !found {
            lines.push(port_line.trim_end().to_string());
        }
        lines.join("\n") + "\n"
    } else {
        port_line
    };
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_servers() -> Vec<ServerConfig> {
    server::list_servers()
}

/// Returns the port of each configured server. Used by Settings to add firewall rules for all servers.
#[tauri::command]
pub fn get_server_ports() -> Vec<u16> {
    server::list_servers().into_iter().map(|s| s.port).collect()
}

fn emit_create_log(app: &AppHandle, line: &str) {
    let _ = app.emit("create-server-log", line);
}

/// Run Forge/NeoForge installer with stdout/stderr streamed to the frontend via create-server-log.
async fn run_installer_capture_output(
    app: AppHandle,
    java_path: String,
    work_dir: PathBuf,
    installer_path: String,
) -> Result<std::process::ExitStatus, String> {
    use tokio::io::BufReader;
    use tokio::process::Command;

    let mut child = Command::new(&java_path)
        .args(["-jar", &installer_path, "--installServer"])
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let app_stdout = app.clone();
    let app_stderr = app.clone();

    let out_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                let _ = app_stdout.emit("create-server-log", line);
            }
        }
    });

    let err_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                let _ = app_stderr.emit("create-server-log", line);
            }
        }
    });

    let _ = tokio::join!(out_task, err_task);
    child.wait().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_server(app: AppHandle, config: CreateServerInput) -> Result<ServerConfig, String> {
    let id = Uuid::new_v4().to_string();
    let path = server::servers_dir().join(&id);

    emit_create_log(&app, "Preparing server folder...");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;

    let server_type = match config.server_type.as_str() {
        "forge" | "neoforge" => {
            // Installer-based: download installer, run --installServer, then write eula
            let (installer_url, installer_name): (String, &str) = if config.server_type == "forge" {
                emit_create_log(&app, "Resolving Forge installer URL...");
                let url = match config.forge_build_version.as_deref() {
                    Some(build) => {
                        api::forge::installer_jar_url_with_build(
                            &config.minecraft_version,
                            Some(build),
                        )
                        .await?
                    }
                    None => api::forge::installer_jar_url(&config.minecraft_version).await?,
                };
                (url, "forge-installer.jar")
            } else {
                emit_create_log(&app, "Resolving NeoForge installer URL...");
                let ver = config
                    .neoforge_version
                    .as_deref()
                    .unwrap_or(&config.minecraft_version);
                (
                    api::neoforge::installer_jar_url(ver),
                    "neoforge-installer.jar",
                )
            };
            let installer_path = path.join(installer_name);
            emit_create_log(&app, "Downloading installer (this may take a minute)...");
            download::download_file(&installer_url, &installer_path).await?;
            emit_create_log(&app, "Checking Java...");
            let java_path = ensure_java_available_logged(config.java_path.as_deref(), Some(&app)).await?;
            let java_str = java_path.to_string_lossy().to_string();
            let path_clone = path.clone();
            let installer_path_str = installer_path
                .to_str()
                .unwrap_or("neoforge-installer.jar")
                .to_string();
            let app_install = app.clone();
            emit_create_log(&app, "Running installer (patching server files)...");
            let status = run_installer_capture_output(
                app_install,
                java_str,
                path_clone,
                installer_path_str,
            )
            .await?;
            if !status.success() {
                return Err(
                    "Forge/NeoForge installer failed. Check that Java is correct.".to_string(),
                );
            }
            emit_create_log(&app, "Cleaning up installer...");
            let _ = std::fs::remove_file(&installer_path);
            emit_create_log(&app, "Accepting EULA...");
            let eula_path = path.join("eula.txt");
            std::fs::write(eula_path, "eula=true\n").map_err(|e| e.to_string())?;
            if config.server_type == "forge" {
                ServerType::Forge
            } else {
                ServerType::NeoForge
            }
        }
        "quilt" => {
            return Err(
                "Quilt server creation is not yet supported. Install from https://quiltmc.org"
                    .to_string(),
            );
        }
        _ => {
            emit_create_log(&app, "Resolving server jar URL...");
            let jar_url: String = match config.server_type.as_str() {
                "vanilla" => {
                    api::mojang::fetch_server_download_url(&config.minecraft_version).await?
                }
                "paper" => api::paper::get_jar_url(&config.minecraft_version).await?,
                "purpur" => api::purpur::download_url(&config.minecraft_version),
                "fabric" => {
                    match (
                        config.fabric_loader_version.as_deref(),
                        config.fabric_installer_version.as_deref(),
                    ) {
                        (None, None) => api::fabric::get_jar_url(&config.minecraft_version).await?,
                        (loader, installer) => {
                            api::fabric::get_jar_url_with_versions(
                                &config.minecraft_version,
                                loader,
                                installer,
                            )
                            .await?
                        }
                    }
                }
                "spigot" => api::serverjars::spigot_download_url(&config.minecraft_version),
                "bukkit" => api::serverjars::craftbukkit_download_url(&config.minecraft_version),
                _ => return Err(format!("Unsupported server type: {}", config.server_type)),
            };
            let jar_path = path.join("server.jar");
            emit_create_log(&app, "Downloading server jar (this may take a minute)...");
            download::download_file(&jar_url, &jar_path).await?;
            emit_create_log(&app, "Accepting EULA...");
            let eula_path = path.join("eula.txt");
            std::fs::write(eula_path, "eula=true\n").map_err(|e| e.to_string())?;
            match config.server_type.as_str() {
                "vanilla" => ServerType::Vanilla,
                "paper" => ServerType::Paper,
                "purpur" => ServerType::Purpur,
                "fabric" => ServerType::Fabric,
                "spigot" => ServerType::Spigot,
                "bukkit" => ServerType::Bukkit,
                _ => return Err("Invalid server type".to_string()),
            }
        }
    };

    emit_create_log(&app, "Setting server port...");
    let port = resolve_server_port(config.port)?;
    set_server_port(&path, port)?;
    if let Some(ref motd) = config.motd {
        set_server_property(&path, "motd", motd)?;
    }
    if let Some(ref favicon_b64) = config.favicon_b64 {
        emit_create_log(&app, "Writing server icon...");
        write_server_icon(&path, favicon_b64)?;
    }
    emit_create_log(&app, "Server created successfully!");
    let server_config = ServerConfig {
        id: id.clone(),
        name: config.name,
        server_type: server_type.clone(),
        minecraft_version: config.minecraft_version,
        memory_mb: config.memory_mb,
        port,
        java_path: config.java_path,
        path: path.clone(),
        archived: false,
        trashed_at: None,
    };
    server::add_server(server_config.clone());
    Ok(server_config)
}

fn write_server_icon(server_dir: &Path, favicon_b64: &str) -> Result<(), String> {
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(favicon_b64)
        .map_err(|e| format!("Invalid favicon base64: {}", e))?;
    let path = server_dir.join("server-icon.png");
    std::fs::write(&path, decoded).map_err(|e| e.to_string())?;
    Ok(())
}

/// Picks a port: use provided if valid and free; otherwise next free port from 25565.
/// Checks both iHostMC server list AND actual system port availability.
fn resolve_server_port(requested: Option<u16>) -> Result<u16, String> {
    const MIN: u16 = 25565;
    const MAX: u16 = 65535;
    let used: std::collections::HashSet<u16> =
        server::list_servers().into_iter().map(|s| s.port).collect();
    if let Some(p) = requested {
        if p < 1 || p > MAX {
            return Err(format!("Port must be between 1 and {}", MAX));
        }
        if used.contains(&p) {
            return Err(format!("Port {} is already used by another server", p));
        }
        return Ok(p);
    }
    for p in MIN..=MAX {
        if !used.contains(&p) && is_port_free(p) {
            return Ok(p);
        }
    }
    Err("No free port available".to_string())
}

#[derive(Deserialize)]
pub struct CreateServerInput {
    pub name: String,
    pub server_type: String,
    pub minecraft_version: String,
    #[serde(default)]
    pub fabric_loader_version: Option<String>,
    #[serde(default)]
    pub fabric_installer_version: Option<String>,
    #[serde(default)]
    pub forge_build_version: Option<String>,
    #[serde(default)]
    pub neoforge_version: Option<String>,
    pub memory_mb: u32,
    #[serde(default)]
    pub port: Option<u16>,
    pub java_path: Option<String>,
    #[serde(default)]
    pub motd: Option<String>,
    #[serde(default)]
    pub favicon_b64: Option<String>,
}

/// Archive server (hide from active list, like AI advisor).
#[tauri::command]
pub fn archive_server(id: String) -> Result<(), String> {
    if process::is_running() {
        if process::running_server_id().as_deref() == Some(id.as_str()) {
            return Err("Stop the running server first".to_string());
        }
    }
    if server::archive_server(&id) {
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Unarchive server (restore to active list).
#[tauri::command]
pub fn unarchive_server(id: String) -> Result<(), String> {
    if server::unarchive_server(&id) {
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Move server to trash (soft delete). Server stays in list with trashed_at set.
#[tauri::command]
pub fn trash_server(id: String) -> Result<(), String> {
    if process::is_running() {
        if process::running_server_id().as_deref() == Some(id.as_str()) {
            return Err("Stop the running server first".to_string());
        }
    }
    if server::trash_server(&id) {
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Restore server from trash.
#[tauri::command]
pub fn restore_server(id: String) -> Result<(), String> {
    if server::restore_server(&id) {
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Permanently deletes a server: removes from list, deletes data directory.
/// Server must be in trash first. Use trash_server to move to trash.
#[tauri::command]
pub fn delete_server(id: String) -> Result<(), String> {
    if process::is_running() {
        if process::running_server_id().as_deref() == Some(id.as_str()) {
            return Err("Stop the running server first".to_string());
        }
    }
    let cfg = server::get_server(&id);
    let is_trashed = cfg.as_ref().and_then(|c| c.trashed_at.as_ref()).is_some();
    if !is_trashed {
        return Err("Move server to trash first, then permanently delete".to_string());
    }
    if server::remove_server(&id) {
        let dir = server::server_dir(&id);
        if dir.exists() {
            process::kill_java_processes_in_dir(&dir);

            for attempt in 0..3 {
                match std::fs::remove_dir_all(&dir) {
                    Ok(()) => return Ok(()),
                    Err(_) if attempt < 2 => {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        process::kill_java_processes_in_dir(&dir);
                        continue;
                    }
                    Err(e) => {
                        return Err(format!(
                            "Could not delete server files (a process may still be using them): {}",
                            e
                        ))
                    }
                }
            }
        }
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

/// Filter Minecraft console `>` prompts from server output.
/// Handles: standalone prompt lines (`> > > >`), and prompts prefixed on
/// real log lines (`> [19:00:20 INFO]: ...`).
fn filter_server_output(chunk: &str) -> String {
    let mut output = String::with_capacity(chunk.len());
    for raw_line in chunk.split('\n') {
        let content = raw_line.trim_end_matches('\r');
        let trimmed = content.trim();

        // Drop lines that are purely > prompts and whitespace
        if !trimmed.is_empty() && trimmed.chars().all(|c| c == '>' || c == ' ') {
            continue;
        }

        // Strip leading "> " prompt sequences from lines with actual content
        let mut s = content;
        while s.starts_with("> ") {
            s = &s[2..];
        }
        if s.starts_with('>') && s.len() > 1 {
            s = &s[1..];
        }
        let s = s.trim_start();

        // If stripping left us empty (was all prompts), skip
        if s.is_empty() && !trimmed.is_empty() {
            continue;
        }

        if !output.is_empty() {
            output.push('\n');
        }
        output.push_str(s);
    }
    output
}

/// Build an emit callback that filters console prompts before sending to the frontend.
fn make_server_emit(app: &AppHandle) -> Arc<dyn Fn(String) + Send + Sync> {
    let app = app.clone();
    Arc::new(move |chunk: String| {
        let filtered = filter_server_output(&chunk);
        if !filtered.trim().is_empty() {
            let _ = app.emit("server-output", filtered);
        }
    })
}

/// Check if a port is free. We do NOT bind to the port (binding would put it in TIME_WAIT and then
/// the Minecraft server could fail to bind). On Windows we use netstat; on Unix we use ss/netstat.
fn is_port_free(port: u16) -> bool {
    !process::port_is_listening(port)
}

/// Wait for a TCP port to become available, retrying for up to `timeout_ms`.
fn wait_for_port_free(port: u16, timeout_ms: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);
    loop {
        if is_port_free(port) {
            return true;
        }
        if start.elapsed() > timeout {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

/// Find the first port >= from_port that is free on the system and not used by another server.
fn next_free_port_from(from_port: u16, exclude_server_id: &str) -> Option<u16> {
    let used: std::collections::HashSet<u16> = server::list_servers()
        .into_iter()
        .filter(|s| s.id != exclude_server_id)
        .map(|s| s.port)
        .collect();
    for p in from_port..=65535 {
        if !used.contains(&p) && is_port_free(p) {
            return Some(p);
        }
    }
    None
}

#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    id: String,
    run_in_background: Option<bool>,
) -> Result<(), String> {
    let config = server::get_server(&id).ok_or("Server not found")?;
    if config.trashed_at.is_some() {
        return Err("Cannot start a server in trash. Restore it first.".to_string());
    }
    let detach = run_in_background.unwrap_or(false);

    let emit_log = |msg: &str| {
        let _ = app.emit(
            "server-output",
            format!("\x1b[36m[iHostMC]\x1b[0m {}\r\n", msg),
        );
    };

    emit_log(&format!(
        "Starting server \"{}\" ({} {})...",
        config.name, config.server_type, config.minecraft_version
    ));

    emit_log("Cleaning up orphaned processes...");
    let dir_killed = process::kill_java_processes_in_dir(&config.path);
    let port_killed = process::kill_process_on_port(config.port);
    let total_killed = dir_killed + port_killed;
    if total_killed > 0 {
        emit_log(&format!("Killed {} orphaned process(es).", total_killed));
        std::thread::sleep(std::time::Duration::from_millis(800));
    }

    // Resolve port *before* writing server.properties: use config.port only if it's free, else next free.
    let mut port = config.port;
    if !is_port_free(port) {
        emit_log(&format!(
            "\x1b[33mPort {} is busy, waiting for release...\x1b[0m",
            port
        ));
        if !wait_for_port_free(port, 10000) {
            if let Some(new_port) = next_free_port_from(port, &id) {
                emit_log(&format!(
                    "\x1b[33mPort {} in use; switching to port {}.\x1b[0m",
                    port, new_port
                ));
                server::update_server_port(&id, new_port).map_err(|e| e.to_string())?;
                port = new_port;
            } else {
                emit_log(&format!(
                    "\x1b[31mPort {} is still in use after cleanup.\x1b[0m",
                    port
                ));
                return Err(format!(
                    "Port {} is already in use by another application. Close it or choose a different port.",
                    port
                ));
            }
        } else {
            emit_log(&format!("\x1b[32mPort {} is now free.\x1b[0m", port));
        }
    }

    // Last-second check in case something bound in the meantime.
    if !is_port_free(port) {
        if let Some(new_port) = next_free_port_from(port, &id) {
            emit_log(&format!(
                "\x1b[33mPort {} in use at launch; switching to port {}.\x1b[0m",
                port, new_port
            ));
            server::update_server_port(&id, new_port).map_err(|e| e.to_string())?;
            port = new_port;
        } else {
            return Err(format!(
                "Port {} is in use. Close the other application or choose a different port.",
                port
            ));
        }
    }

    emit_log(&format!("Setting server port to {}...", port));
    set_server_port(&config.path, port)?;
    set_server_property(&config.path, "online-mode", "false")?;
    emit_log("Set online-mode=false (so friends can connect via Share server / relay).");

    let use_run_script = matches!(config.server_type, ServerType::Forge | ServerType::NeoForge);

    if detach {
        emit_log("Mode: background (server will keep running when app closes)");

        let log_path = config.path.join("server.log");
        let _ = std::fs::write(&log_path, "");

        if use_run_script {
            emit_log("Launching run script (Forge/NeoForge)...");
            process::start_run_script_detached(&config.path)?;
        } else {
            let jar_path = config.path.join("server.jar");
            if !jar_path.exists() {
                emit_log("\x1b[31mError: server.jar not found!\x1b[0m");
                return Err("Server JAR not found".to_string());
            }
            emit_log("Checking Java installation...");
            let java_path =
                ensure_java_available_logged(config.java_path.as_deref(), Some(&app)).await?;
            let java_str = java_path.to_string_lossy().to_string();
            let jar_str = jar_path.to_string_lossy().to_string();
            // Re-verify port right before launch (async Java check may have allowed something else to bind).
            let launch_port = port;
            if !is_port_free(launch_port) {
                if let Some(new_port) = next_free_port_from(launch_port, &id) {
                    emit_log(&format!(
                        "\x1b[33mPort {} taken before launch; using port {}.\x1b[0m",
                        launch_port, new_port
                    ));
                    server::update_server_port(&id, new_port).map_err(|e| e.to_string())?;
                    set_server_port(&config.path, new_port)?;
                }
            }
            emit_log(&format!(
                "Launching: java -Xmx{}M -jar server.jar nogui",
                config.memory_mb
            ));
            process::start_java_server_detached(&java_str, &jar_str, config.memory_mb)?;
        }

        emit_log("Tailing server.log for live output...");
        let tail_emit = make_server_emit(&app);
        let app_exit = app.clone();
        let on_exit: Option<Arc<dyn Fn() + Send + Sync>> = Some(Arc::new(move || {
            let _ = app_exit.emit("server-stopped", ());
        }));
        process::tail_server_log(&log_path, tail_emit, on_exit);
    } else {
        emit_log("Mode: attached (output will stream below)");
        let emit = make_server_emit(&app);
        let app_exit = app.clone();
        let on_exit: Option<Arc<dyn Fn() + Send + Sync>> = Some(Arc::new(move || {
            let _ = app_exit.emit("server-stopped", ());
        }));
        if use_run_script {
            emit_log("Launching run script (Forge/NeoForge)...");
            process::start_run_script(&config.path, emit, on_exit)?;
        } else {
            let jar_path = config.path.join("server.jar");
            if !jar_path.exists() {
                emit_log("\x1b[31mError: server.jar not found!\x1b[0m");
                return Err("Server JAR not found".to_string());
            }
            emit_log("Checking Java installation...");
            let java_path =
                ensure_java_available_logged(config.java_path.as_deref(), Some(&app)).await?;
            let java_str = java_path.to_string_lossy().to_string();
            let jar_str = jar_path.to_string_lossy().to_string();
            let launch_port = port;
            if !is_port_free(launch_port) {
                if let Some(new_port) = next_free_port_from(launch_port, &id) {
                    emit_log(&format!(
                        "\x1b[33mPort {} taken before launch; using port {}.\x1b[0m",
                        launch_port, new_port
                    ));
                    server::update_server_port(&id, new_port).map_err(|e| e.to_string())?;
                    set_server_port(&config.path, new_port)?;
                }
            }
            emit_log(&format!(
                "Launching: java -Xmx{}M -jar server.jar nogui",
                config.memory_mb
            ));
            process::start_java_server(&java_str, &jar_str, config.memory_mb, emit, on_exit)?;
        }
    }

    emit_log("\x1b[32mServer process started successfully!\x1b[0m");
    process::set_server_start_time();
    process::set_running_server_id(Some(id.clone()));
    let _ = app.emit("server-started", id);
    Ok(())
}

#[tauri::command]
pub fn stop_server() -> Result<bool, String> {
    Ok(process::stop_server())
}

#[tauri::command]
pub fn send_server_input(input: String) -> Result<(), String> {
    process::write_stdin(input.as_bytes())
}

#[tauri::command]
pub fn get_server_status() -> bool {
    process::is_running()
}

#[tauri::command]
pub fn get_running_server_id() -> Option<String> {
    process::running_server_id()
}

/// Stats for the running server (only when the given server_id is the one currently running).
#[derive(serde::Serialize)]
pub struct ServerStats {
    pub uptime_secs: u64,
    pub memory_used_mb: u64,
    pub memory_allocated_mb: u32,
    pub cpu_percent: f32,
}

#[tauri::command]
pub fn get_server_stats(server_id: String) -> Option<ServerStats> {
    if process::running_server_id().as_deref() != Some(server_id.as_str()) {
        return None;
    }
    let config = server::get_server(&server_id)?;
    let uptime_secs = process::server_uptime_secs().unwrap_or(0);
    let (memory_used_mb, cpu_percent) =
        process::get_server_process_stats(&config.path).unwrap_or((0, 0.0));
    Some(ServerStats {
        uptime_secs,
        memory_used_mb,
        memory_allocated_mb: config.memory_mb,
        cpu_percent,
    })
}

#[tauri::command]
pub fn get_run_in_background() -> bool {
    server::load_preferences().run_in_background
}

#[tauri::command]
pub fn set_run_in_background(run: bool) {
    let mut prefs = server::load_preferences();
    prefs.run_in_background = run;
    server::save_preferences(&prefs);
}

#[tauri::command]
pub fn get_idle_slideshow() -> bool {
    server::load_preferences().idle_slideshow
}

#[tauri::command]
pub fn set_idle_slideshow(enabled: bool) {
    let mut prefs = server::load_preferences();
    prefs.idle_slideshow = enabled;
    server::save_preferences(&prefs);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn sort_versions_newest_first(list: &mut [String]) {
    api::version_sort::sort_versions_newest_first(list);
}

#[tauri::command]
pub async fn get_versions_vanilla() -> Result<Vec<String>, String> {
    let manifest = api::mojang::fetch_manifest().await?;
    let mut list = api::mojang::release_versions(&manifest);
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_paper() -> Result<Vec<String>, String> {
    let mut list = api::paper::fetch_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_purpur() -> Result<Vec<String>, String> {
    let mut list = api::purpur::fetch_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_fabric() -> Result<Vec<String>, String> {
    let mut list = api::fabric::fetch_game_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_fabric_loader() -> Result<Vec<String>, String> {
    let mut list = api::fabric::fetch_loader_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_fabric_installer() -> Result<Vec<String>, String> {
    let mut list = api::fabric::fetch_installer_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

/// Spigot uses the same Minecraft version list as Vanilla (release versions).
#[tauri::command]
pub async fn get_versions_spigot() -> Result<Vec<String>, String> {
    let manifest = api::mojang::fetch_manifest().await?;
    let mut list = api::mojang::release_versions(&manifest);
    sort_versions_newest_first(&mut list);
    Ok(list)
}

/// CraftBukkit (Bukkit) uses the same Minecraft version list as Vanilla.
#[tauri::command]
pub async fn get_versions_bukkit() -> Result<Vec<String>, String> {
    let manifest = api::mojang::fetch_manifest().await?;
    let mut list = api::mojang::release_versions(&manifest);
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_forge() -> Result<Vec<String>, String> {
    api::forge::fetch_minecraft_versions().await
}

#[tauri::command]
pub async fn get_versions_forge_builds(
    minecraft_version: String,
) -> Result<Vec<api::forge::ForgeBuildOption>, String> {
    api::forge::fetch_builds_for_game(&minecraft_version).await
}

#[tauri::command]
pub async fn get_versions_neoforge() -> Result<Vec<String>, String> {
    let mut list = api::neoforge::fetch_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_neoforge_for_game(
    minecraft_version: String,
) -> Result<Vec<String>, String> {
    let mut list = api::neoforge::fetch_versions_for_game(&minecraft_version).await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_fabric_loader_for_game(
    game_version: String,
) -> Result<Vec<String>, String> {
    let mut list = api::fabric::fetch_loader_versions_for_game(&game_version).await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_quilt() -> Result<Vec<String>, String> {
    let mut list = api::quilt::fetch_game_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub async fn get_versions_quilt_loader() -> Result<Vec<String>, String> {
    let mut list = api::quilt::fetch_loader_versions().await?;
    sort_versions_newest_first(&mut list);
    Ok(list)
}

#[tauri::command]
pub fn get_quilt_installer_url(game_version: String, loader_version: String) -> Option<String> {
    api::quilt::installer_jar_url(&game_version, &loader_version)
}

#[tauri::command]
pub fn get_system_ram_mb() -> Result<u64, String> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    Ok(sys.available_memory() / (1024 * 1024))
}

async fn ensure_java_available_logged(
    server_java_path: Option<&str>,
    app: Option<&AppHandle>,
) -> Result<std::path::PathBuf, String> {
    let emit_log = |msg: &str| {
        if let Some(app) = app {
            let _ = app.emit(
                "server-output",
                format!("\x1b[36m[iHostMC]\x1b[0m {}\r\n", msg),
            );
        }
    };

    let candidates: Vec<std::path::PathBuf> = [
        server_java_path.and_then(|p| java::resolve_java_path(Some(p)).ok()),
        java::bundled_java_path(),
        java::resolve_java_path(None).ok(),
    ]
    .into_iter()
    .flatten()
    .collect();

    emit_log(&format!(
        "Scanning {} Java candidate(s)...",
        candidates.len()
    ));

    for path in &candidates {
        if let Some(ver) = java::get_java_version(path) {
            if ver >= java::MIN_JAVA_VERSION {
                emit_log(&format!("Found Java {} at {}", ver, path.display()));
                return Ok(path.clone());
            } else {
                emit_log(&format!(
                    "\x1b[90mSkipping Java {} at {} (need {}+)\x1b[0m",
                    ver,
                    path.display(),
                    java::MIN_JAVA_VERSION
                ));
            }
        }
    }

    emit_log("\x1b[33mNo suitable Java found. Downloading Java 21...\x1b[0m");
    emit_log("This may take a minute on first run.");
    let path_str = download_java().await?;
    emit_log("\x1b[32mJava download complete!\x1b[0m");
    Ok(std::path::PathBuf::from(path_str))
}

#[tauri::command]
pub fn get_java_paths() -> Result<JavaPaths, String> {
    let bundled = java::bundled_java_path().map(|p| p.to_string_lossy().to_string());
    let system = java::resolve_java_path(None)
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    Ok(JavaPaths { bundled, system })
}

#[derive(serde::Serialize)]
pub struct JavaPaths {
    pub bundled: Option<String>,
    pub system: Option<String>,
}

#[tauri::command]
pub async fn download_java() -> Result<String, String> {
    let dir = java::bundled_java_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Remove old Java installations so bundled_java_path finds the new one
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| n.starts_with("jdk-") || n.starts_with("jre-"))
            {
                let _ = std::fs::remove_dir_all(&path);
            }
        }
    }
    let (url, archive_path) = get_adoptium_download().await?;
    download::download_file(&url, Path::new(&archive_path)).await?;
    extract_java_archive(&archive_path, &dir)?;
    std::fs::remove_file(&archive_path).ok();
    java::bundled_java_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or("Java extraction failed".to_string())
}

async fn get_adoptium_download() -> Result<(String, String), String> {
    #[cfg(windows)]
    let (os, ext) = ("windows", "zip");
    #[cfg(target_os = "macos")]
    let (os, ext) = ("mac", "tar.gz");
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let (os, ext) = ("linux", "tar.gz");

    #[cfg(target_arch = "x86_64")]
    let arch = "x64";
    #[cfg(target_arch = "aarch64")]
    let arch = "aarch64";
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    let arch = "x64";

    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/21/ga/{}/{}/jre/hotspot/normal/eclipse?project=jdk",
        os, arch
    );
    let dir = java::bundled_java_dir();
    let archive = dir.join(format!("jre.{}", ext));
    Ok((url, archive.to_string_lossy().to_string()))
}

fn extract_java_archive(archive_path: &str, dest: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let path = dest.join(entry.name());
            if entry.name().ends_with('/') {
                std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = path.parent() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
                let mut out = std::fs::File::create(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
        let dec = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(dec);
        archive.unpack(dest).map_err(|e| e.to_string())?;
        Ok(())
    }
}

// ---- Server files (browse / edit) ----

#[derive(serde::Serialize)]
pub struct ServerFileEntry {
    pub name: String,
    pub is_dir: bool,
    pub path: String,
}

/// Entry with size for backup manifest scan (flat list, recursive).
#[derive(serde::Serialize)]
pub struct ServerFileScanEntry {
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn list_server_files(
    server_id: String,
    subpath: Option<String>,
) -> Result<Vec<ServerFileEntry>, String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let base = config.path.canonicalize().map_err(|e| e.to_string())?;
    let path = match subpath.as_deref().unwrap_or("").trim() {
        "" => base.clone(),
        p => {
            let joined = base.join(p);
            let canonical = joined.canonicalize().map_err(|e| e.to_string())?;
            if !canonical.starts_with(&base) {
                return Err("Path outside server directory".to_string());
            }
            canonical
        }
    };
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let mut entries: Vec<ServerFileEntry> = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| {
            let e = e.ok()?;
            let name = e.file_name().to_string_lossy().to_string();
            let is_dir = e.file_type().ok()?.is_dir();
            let path = e.path();
            let rel = path.strip_prefix(&base).ok()?;
            let path_str = rel.to_string_lossy().replace('\\', "/");
            Some(ServerFileEntry {
                name,
                is_dir,
                path: path_str,
            })
        })
        .collect();
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

const SCAN_MAX_ENTRIES: usize = 2500;

fn scan_dir_recursive(
    base: &std::path::Path,
    dir: &std::path::Path,
    out: &mut Vec<ServerFileScanEntry>,
) -> Result<(), String> {
    if out.len() >= SCAN_MAX_ENTRIES {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for e in entries {
        if out.len() >= SCAN_MAX_ENTRIES {
            break;
        }
        let e = e.map_err(|e| e.to_string())?;
        let path = e.path();
        let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let path_str = rel.to_string_lossy().replace('\\', "/");
        let meta = e.metadata().map_err(|e| e.to_string())?;
        let is_dir = meta.is_dir();
        let size_bytes = if is_dir { 0u64 } else { meta.len() };
        out.push(ServerFileScanEntry {
            path: path_str,
            is_dir,
            size_bytes,
        });
        if is_dir {
            scan_dir_recursive(base, &path, out)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn scan_server_files_for_backup(server_id: String) -> Result<Vec<ServerFileScanEntry>, String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let base = config.path.canonicalize().map_err(|e| e.to_string())?;
    if !base.is_dir() {
        return Err("Server path is not a directory".to_string());
    }
    let mut out = Vec::with_capacity(512);
    scan_dir_recursive(&base, &base, &mut out)?;
    Ok(out)
}

#[tauri::command]
pub fn read_server_file(server_id: String, path: String) -> Result<String, String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let base = config.path.canonicalize().map_err(|e| e.to_string())?;
    let path = path.trim().replace('/', std::path::MAIN_SEPARATOR_STR);
    let full = base.join(&path);
    let canonical = full.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&base) {
        return Err("Path outside server directory".to_string());
    }
    if canonical.is_dir() {
        return Err("Cannot read directory as file".to_string());
    }
    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_server_file(server_id: String, path: String, content: String) -> Result<(), String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let base = config.path.canonicalize().map_err(|e| e.to_string())?;
    let path = path.trim().replace('/', std::path::MAIN_SEPARATOR_STR);
    if path.contains("..") {
        return Err("Path must not contain ..".to_string());
    }
    let full = base.join(&path);
    if let Some(p) = full.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let resolved = full.canonicalize().unwrap_or_else(|_| full.clone());
    if !resolved.starts_with(&base) {
        return Err("Path outside server directory".to_string());
    }
    std::fs::write(&full, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_server_folder(server_id: String) -> Result<(), String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let path = config.path.canonicalize().map_err(|e| e.to_string())?;
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_test_control_url() -> Option<String> {
    if crate::test_server::should_run() {
        Some(crate::test_server::test_control_url())
    } else {
        None
    }
}

#[tauri::command]
pub fn rename_server(id: String, new_name: String) -> Result<(), String> {
    server::rename_server(&id, &new_name)
}

/// Opens DevTools on the given window. Available in all builds when user enables Developer menu.
#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    let _ = window.open_devtools();
}

#[tauri::command]
pub async fn ping_minecraft_server(
    host: String,
    port: Option<u16>,
) -> Result<crate::slp::ServerPingResult, String> {
    crate::slp::ping_server(&host, port).await
}

// ---- Mods & Plugins ----

#[tauri::command]
pub async fn search_modrinth_mods(
    query: String,
    game_version: Option<String>,
    loaders: Option<Vec<String>>,
    limit: Option<u32>,
) -> Result<Vec<api::modrinth::ModrinthHit>, String> {
    api::modrinth::search_mods(
        &query,
        game_version.as_deref(),
        loaders,
        limit.unwrap_or(20),
    )
    .await
}

#[tauri::command]
pub async fn search_modrinth_plugins(
    query: String,
    game_version: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<api::modrinth::ModrinthHit>, String> {
    api::modrinth::search_plugins(&query, game_version.as_deref(), limit.unwrap_or(20)).await
}

#[tauri::command]
pub async fn search_spiget_plugins(
    query: String,
    size: Option<u32>,
) -> Result<Vec<api::spiget::SpigetResource>, String> {
    api::spiget::search_resources(&query, size.unwrap_or(20)).await
}

#[tauri::command]
pub async fn install_modrinth_mod(
    server_id: String,
    project_slug: String,
    game_version: String,
) -> Result<(), String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let url = api::modrinth::get_version_download_url(&project_slug, &game_version).await?;
    let mods_dir = config.path.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    let filename = url.split('/').last().unwrap_or("mod.jar");
    let path = mods_dir.join(filename);
    download::download_file(&url, &path).await
}

#[tauri::command]
pub async fn install_modrinth_plugin(
    server_id: String,
    project_slug: String,
    game_version: String,
) -> Result<(), String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let url = api::modrinth::get_version_download_url(&project_slug, &game_version).await?;
    let plugins_dir = config.path.join("plugins");
    std::fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
    let filename = url.split('/').last().unwrap_or("plugin.jar");
    let path = plugins_dir.join(filename);
    download::download_file(&url, &path).await
}

#[tauri::command]
pub async fn install_spiget_plugin(server_id: String, resource_id: u64) -> Result<(), String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let url = api::spiget::download_url(resource_id);
    let plugins_dir = config.path.join("plugins");
    std::fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
    let path = plugins_dir.join(format!("{}.jar", resource_id));
    download::download_file(&url, &path).await
}

// ---- CurseForge ----

fn get_curseforge_key() -> Result<String, String> {
    if let Ok(key) = std::env::var("CURSEFORGE_API_KEY") {
        if !key.is_empty() {
            return Ok(key);
        }
    }
    let prefs = server::load_preferences();
    prefs
        .curseforge_api_key
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "CurseForge API key not set. Add it in Settings.".to_string())
}

#[tauri::command]
pub async fn search_curseforge_mods(
    query: String,
    game_version: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<api::curseforge::CurseForgeHit>, String> {
    let key = get_curseforge_key()?;
    api::curseforge::search_mods(&key, &query, game_version.as_deref(), limit.unwrap_or(20)).await
}

#[tauri::command]
pub async fn search_curseforge_plugins(
    query: String,
    game_version: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<api::curseforge::CurseForgeHit>, String> {
    let key = get_curseforge_key()?;
    api::curseforge::search_plugins(&key, &query, game_version.as_deref(), limit.unwrap_or(20))
        .await
}

#[tauri::command]
pub async fn install_curseforge_mod(
    server_id: String,
    mod_id: u64,
    game_version: String,
) -> Result<(), String> {
    let key = get_curseforge_key()?;
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let url = api::curseforge::get_download_url(&key, mod_id, &game_version).await?;
    let mods_dir = config.path.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    let filename = url.split('/').last().unwrap_or("mod.jar");
    let path = mods_dir.join(filename);
    download::download_file(&url, &path).await
}

#[tauri::command]
pub async fn install_curseforge_plugin(
    server_id: String,
    mod_id: u64,
    game_version: String,
) -> Result<(), String> {
    let key = get_curseforge_key()?;
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let url = api::curseforge::get_download_url(&key, mod_id, &game_version).await?;
    let plugins_dir = config.path.join("plugins");
    std::fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
    let filename = url.split('/').last().unwrap_or("plugin.jar");
    let path = plugins_dir.join(filename);
    download::download_file(&url, &path).await
}

#[tauri::command]
pub fn get_curseforge_api_key() -> Option<String> {
    if let Ok(key) = std::env::var("CURSEFORGE_API_KEY") {
        if !key.is_empty() {
            return Some(key);
        }
    }
    server::load_preferences().curseforge_api_key
}

#[tauri::command]
pub fn set_curseforge_api_key(key: String) {
    let mut prefs = server::load_preferences();
    prefs.curseforge_api_key = if key.trim().is_empty() {
        None
    } else {
        Some(key.trim().to_string())
    };
    server::save_preferences(&prefs);
}

/// Fetch the machine's public IPv4 address via an external service (ipify, then icanhazip as fallback).
#[tauri::command]
pub async fn get_public_ip() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("iHostMC/1.0.0")
        .build()
        .map_err(|e| e.to_string())?;
    let urls = ["https://api.ipify.org", "https://icanhazip.com"];
    for url in urls {
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                let ip = resp.text().await.map_err(|e| e.to_string())?;
                let ip = ip.trim().to_string();
                if !ip.is_empty() && ip.chars().all(|c| c.is_ascii_digit() || c == '.') {
                    return Ok(ip);
                }
            }
        }
    }
    Err("Could not fetch public IP.".to_string())
}

/// Try to add UPnP port mapping on the router for the given port. Returns external "ip:port" on success.
#[tauri::command]
pub async fn try_upnp_forward(port: u16) -> Result<String, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::upnp::try_upnp_forward(port).map(|addr| {
            crate::upnp::set_upnp_port(port);
            addr
        })
    })
    .await
    .map_err(|e| e.to_string())?;
    result
}

/// Remove UPnP mapping if we added one (e.g. when server stops).
#[tauri::command]
pub fn remove_upnp_if_active() {
    crate::upnp::remove_upnp_if_active();
}

/// Add a Windows Firewall rule to allow inbound TCP on the given port.
/// Self-elevates via a UAC prompt so the app itself doesn't need to run as admin.
#[tauri::command]
pub fn add_windows_firewall_rule(port: u16) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    return Err(format!(
        "Firewall rules are only supported on Windows (requested port {}).",
        port
    ));

    #[cfg(target_os = "windows")]
    {
        let rule_name = format!("iHostMC Minecraft Server (port {})", port);
        let netsh_args = format!(
            "advfirewall firewall add rule name=\"{}\" dir=in action=allow protocol=TCP localport={}",
            rule_name, port
        );
        let ps_script = format!(
            "$p = Start-Process netsh -ArgumentList '{}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode",
            netsh_args
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("canceled")
                || stderr.contains("cancelled")
                || stderr.contains("denied")
            {
                Err("UAC prompt was cancelled. Please accept the elevation prompt to add the firewall rule.".to_string())
            } else if stderr.is_empty() {
                Err("Failed to add firewall rule. Please try again.".to_string())
            } else {
                Err(stderr.to_string())
            }
        }
    }
}

// ---- File Sync (upload mini + big files to backend; two buckets merged on server) ----

const SIZE_THRESHOLD_BIG: u64 = 5 * 1024 * 1024; // 5 MB – files above this go to "big" tier

#[derive(serde::Serialize, Clone)]
pub struct SyncProgressEvent {
    pub server_id: String,
    pub file_path: String,
    pub status: String, // "scanning" | "uploading" | "done" | "skipped" | "failed"
    pub current: usize,
    pub total: usize,
    pub error: Option<String>,
}

const MODS_PREFIX: &str = "mods/";
const PLUGINS_PREFIX: &str = "plugins/";
const JAR_SUFFIX: &str = ".jar";
const LIBRARIES_PREFIX: &str = "libraries/";
const CACHE_PREFIX: &str = "cache/";
const CONFIG_PREFIX: &str = "config/";
const WORLD_PREFIX: &str = "world";
const LOGS_PREFIX: &str = "logs/";

/// How we treat the file: essential (must backup) vs downloadable (can re-fetch).
#[derive(serde::Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileCategory {
    /// Server/config files – essential.
    Config,
    /// World data – essential.
    World,
    /// Mod jars – essential.
    Mod,
    /// Plugin jars – essential.
    Plugin,
    /// libraries/ – re-downloadable, not essential.
    Library,
    /// Server jar, run jar, installers – re-downloadable.
    Jar,
    /// cache/, logs/ – can be recreated.
    Cache,
    /// Everything else – treat as essential.
    Other,
}

impl FileCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            FileCategory::Config => "config",
            FileCategory::World => "world",
            FileCategory::Mod => "mod",
            FileCategory::Plugin => "plugin",
            FileCategory::Library => "library",
            FileCategory::Jar => "jar",
            FileCategory::Cache => "cache",
            FileCategory::Other => "other",
        }
    }
    pub fn is_essential(self) -> bool {
        matches!(
            self,
            FileCategory::Config | FileCategory::World | FileCategory::Mod | FileCategory::Plugin | FileCategory::Other
        )
    }
}

fn classify_path(path: &str) -> FileCategory {
    let path = path.replace('\\', "/");
    let lower = path.to_lowercase();
    let first = path.split('/').next().unwrap_or("");
    if path.starts_with(MODS_PREFIX) && path.ends_with(JAR_SUFFIX) {
        return FileCategory::Mod;
    }
    if path.starts_with(PLUGINS_PREFIX) && path.ends_with(JAR_SUFFIX) {
        return FileCategory::Plugin;
    }
    if path.starts_with(LIBRARIES_PREFIX) {
        return FileCategory::Library;
    }
    if path.starts_with(CACHE_PREFIX) || path.starts_with(LOGS_PREFIX) {
        return FileCategory::Cache;
    }
    if first == WORLD_PREFIX
        || first.starts_with(&format!("{}_", WORLD_PREFIX))
        || first == "DIM-1"
        || first == "DIM1"
    {
        return FileCategory::World;
    }
    if path == "server.properties"
        || path == "eula.txt"
        || path == "bukkit.yml"
        || path == "help.yml"
        || path == "commands.yml"
        || path.starts_with(&format!("{}/", CONFIG_PREFIX))
        || lower.ends_with("paper-global.yml")
        || lower.ends_with("paper-world-defaults.yml")
    {
        return FileCategory::Config;
    }
    if lower.ends_with(".yml") || lower.ends_with(".yaml") || lower.ends_with(".properties") {
        return FileCategory::Config;
    }
    if path.ends_with(JAR_SUFFIX) && !path.contains('/') {
        return FileCategory::Jar;
    }
    if lower.contains("installer") && path.ends_with(JAR_SUFFIX) {
        return FileCategory::Jar;
    }
    if path.starts_with("run.jar") || path == "run.jar" {
        return FileCategory::Jar;
    }
    FileCategory::Other
}

/// Tree node for snapshot manifest (hierarchy for website).
#[derive(serde::Serialize, Clone, Default)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<FileTreeNode>,
}

#[derive(serde::Serialize)]
pub struct CategoryBreakdown {
    pub config: usize,
    pub world: usize,
    #[serde(rename = "mod")]
    pub mod_count: usize,
    pub plugin: usize,
    pub library: usize,
    pub jar: usize,
    pub cache: usize,
    pub other: usize,
    pub essential_count: usize,
    pub downloadable_count: usize,
}

#[derive(serde::Serialize)]
pub struct SyncManifestResult {
    pub mini_files: Vec<ManifestEntry>,
    pub big_files: Vec<ManifestEntry>,
    pub mini_count: usize,
    pub big_count: usize,
    pub mini_bytes: u64,
    pub big_bytes: u64,
    pub total_bytes: u64,
    pub file_tree: Vec<FileTreeNode>,
    pub mods: Vec<String>,
    pub plugins: Vec<String>,
    pub server_name: String,
    pub server_type: String,
    pub minecraft_version: String,
    pub categories: CategoryBreakdown,
}

#[derive(serde::Serialize, Clone)]
pub struct ManifestEntry {
    pub path: String,
    pub size_bytes: u64,
    pub hash: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

fn compute_sha256(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

#[tauri::command]
pub fn build_sync_manifest(server_id: String) -> Result<SyncManifestResult, String> {
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let base = config.path.canonicalize().map_err(|e| e.to_string())?;
    if !base.is_dir() {
        return Err("Server path is not a directory".to_string());
    }

    let mut scan = Vec::with_capacity(512);
    scan_dir_recursive(&base, &base, &mut scan)?;

    let mut mini_files = Vec::new();
    let mut big_files = Vec::new();
    let mut mini_bytes = 0u64;
    let mut big_bytes = 0u64;
    let mut mods = Vec::new();
    let mut plugins = Vec::new();
    let mut root_node = FileTreeNode::default();
    let mut breakdown = CategoryBreakdown {
        config: 0,
        world: 0,
        mod_count: 0,
        plugin: 0,
        library: 0,
        jar: 0,
        cache: 0,
        other: 0,
        essential_count: 0,
        downloadable_count: 0,
    };

    for entry in &scan {
        if entry.is_dir {
            continue;
        }
        let category = classify_path(&entry.path);
        let cat_str = category.as_str();
        match category {
            FileCategory::Config => breakdown.config += 1,
            FileCategory::World => breakdown.world += 1,
            FileCategory::Mod => breakdown.mod_count += 1,
            FileCategory::Plugin => breakdown.plugin += 1,
            FileCategory::Library => breakdown.library += 1,
            FileCategory::Jar => breakdown.jar += 1,
            FileCategory::Cache => breakdown.cache += 1,
            FileCategory::Other => breakdown.other += 1,
        }
        if category.is_essential() {
            breakdown.essential_count += 1;
        } else {
            breakdown.downloadable_count += 1;
        }

        let full_path = base.join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let hash = if entry.size_bytes <= SIZE_THRESHOLD_BIG {
            match std::fs::read(&full_path) {
                Ok(data) => compute_sha256(&data),
                Err(_) => String::new(),
            }
        } else {
            String::new()
        };

        let tier = if entry.size_bytes <= SIZE_THRESHOLD_BIG {
            "mini"
        } else {
            "big"
        };
        let me = ManifestEntry {
            path: entry.path.clone(),
            size_bytes: entry.size_bytes,
            hash,
            is_dir: false,
            category: Some(cat_str.to_string()),
        };

        if entry.size_bytes <= SIZE_THRESHOLD_BIG {
            mini_bytes += entry.size_bytes;
            mini_files.push(me);
        } else {
            big_bytes += entry.size_bytes;
            big_files.push(me);
        }

        if entry.path.starts_with(MODS_PREFIX) && entry.path.ends_with(JAR_SUFFIX) {
            if let Some(stem) = std::path::Path::new(&entry.path)
                .file_stem()
                .and_then(|s| s.to_str())
            {
                mods.push(stem.to_string());
            }
        } else if entry.path.starts_with(PLUGINS_PREFIX) && entry.path.ends_with(JAR_SUFFIX) {
            if let Some(stem) = std::path::Path::new(&entry.path)
                .file_stem()
                .and_then(|s| s.to_str())
            {
                plugins.push(stem.to_string());
            }
        }

        let segments: Vec<&str> = entry.path.split('/').filter(|s| !s.is_empty()).collect();
        if !segments.is_empty() {
            build_tree_ensure_path(&mut root_node, &segments, false, entry.size_bytes, Some(tier), Some(cat_str));
        }
    }

    mods.sort_unstable();
    mods.dedup();
    plugins.sort_unstable();
    plugins.dedup();
    sort_tree_children(&mut root_node);

    Ok(SyncManifestResult {
        mini_count: mini_files.len(),
        big_count: big_files.len(),
        mini_bytes,
        big_bytes,
        total_bytes: mini_bytes + big_bytes,
        mini_files,
        big_files,
        file_tree: root_node.children,
        mods,
        plugins,
        server_name: config.name.clone(),
        server_type: config.server_type.to_string(),
        minecraft_version: config.minecraft_version.clone(),
        categories: breakdown,
    })
}

fn build_tree_ensure_path(
    root: &mut FileTreeNode,
    segments: &[&str],
    is_dir: bool,
    size_bytes: u64,
    tier: Option<&str>,
    category: Option<&str>,
) {
    if segments.is_empty() {
        return;
    }
    let name = segments[0].to_string();
    let path = segments.join("/");
    let (leaf_is_dir, leaf_size, leaf_tier, leaf_category) = if segments.len() == 1 {
        (is_dir, size_bytes, tier.map(String::from), category.map(String::from))
    } else {
        (true, 0u64, None, None)
    };
    if let Some(child) = root.children.iter_mut().find(|c| c.name == name) {
        if segments.len() > 1 {
            build_tree_ensure_path(child, &segments[1..], is_dir, size_bytes, tier, category);
        }
        return;
    }
    let mut node = FileTreeNode {
        name: name.clone(),
        path: path.clone(),
        is_dir: leaf_is_dir,
        size_bytes: leaf_size,
        tier: leaf_tier,
        category: leaf_category,
        children: vec![],
    };
    if segments.len() > 1 {
        build_tree_ensure_path(&mut node, &segments[1..], is_dir, size_bytes, tier, category);
    }
    root.children.push(node);
}

fn sort_tree_children(node: &mut FileTreeNode) {
    node.children.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    for c in &mut node.children {
        sort_tree_children(c);
    }
}

/// Upload one file to sync API; returns "skipped" or "synced" on success.
async fn upload_sync_file(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    file_path: &str,
    file_data: Vec<u8>,
    storage_tier: &str,
    hash: &str,
) -> Result<String, String> {
    let filename = file_path.split('/').last().unwrap_or("file").to_string();
    let form = reqwest::multipart::Form::new()
        .text("filePath", file_path.to_string())
        .text("fileHash", hash.to_string())
        .text("storageTier", storage_tier.to_string())
        .part(
            "file",
            reqwest::multipart::Part::bytes(file_data)
                .file_name(filename)
                .mime_str("application/octet-stream")
                .unwrap(),
        );

    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status_code = resp.status().as_u16();
    if status_code >= 200 && status_code < 300 {
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let status = body
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("synced");
        return Ok(status.to_string());
    }
    let err_text = resp.text().await.unwrap_or_default();
    let short_err = if status_code == 413 {
        "HTTP 413: Request Entity Too Large".to_string()
    } else {
        let first_line = err_text.lines().next().unwrap_or("").trim();
        let clean = first_line
            .strip_prefix("<title>")
            .and_then(|s| s.strip_suffix("</title>"))
            .unwrap_or(first_line);
        if clean.len() > 200 {
            format!("HTTP {}: {}...", status_code, clean[..197].trim())
        } else if clean.is_empty() {
            format!("HTTP {}", status_code)
        } else {
            format!("HTTP {}: {}", status_code, clean)
        }
    };
    Err(short_err)
}

#[tauri::command]
fn is_server_jar_path(path: &str) -> bool {
    let path = path.replace('\\', "/");
    path == "server.jar"
        || path == "run.jar"
        || path == "minecraft_server.jar"
        || (path.ends_with(".jar") && !path.contains('/'))
}

#[tauri::command]
pub async fn sync_mini_files(
    app: AppHandle,
    server_id: String,
    api_base: String,
    token: String,
    backend_server_id: String,
    include_big: Option<bool>,
    exclude_server_jar: Option<bool>,
) -> Result<usize, String> {
    let include_big = include_big.unwrap_or(false);
    let exclude_server_jar = exclude_server_jar.unwrap_or(false);
    let config = server::get_server(&server_id).ok_or("Server not found")?;
    let base = config.path.canonicalize().map_err(|e| e.to_string())?;
    if !base.is_dir() {
        return Err("Server path is not a directory".to_string());
    }

    let emit_progress = |evt: SyncProgressEvent| {
        let _ = app.emit("sync-progress", &evt);
    };

    emit_progress(SyncProgressEvent {
        server_id: server_id.clone(),
        file_path: String::new(),
        status: "scanning".to_string(),
        current: 0,
        total: 0,
        error: None,
    });

    let mut scan = Vec::with_capacity(512);
    scan_dir_recursive(&base, &base, &mut scan)?;

    let mini_files: Vec<&ServerFileScanEntry> = scan
        .iter()
        .filter(|e| {
            !e.is_dir
                && e.size_bytes <= SIZE_THRESHOLD_BIG
                && (!exclude_server_jar || !is_server_jar_path(&e.path))
        })
        .collect();
    let big_files: Vec<&ServerFileScanEntry> = scan
        .iter()
        .filter(|e| {
            !e.is_dir
                && e.size_bytes > SIZE_THRESHOLD_BIG
                && (!exclude_server_jar || !is_server_jar_path(&e.path))
        })
        .collect();

    let total = if include_big {
        mini_files.len() + big_files.len()
    } else {
        mini_files.len()
    };
    let url = format!(
        "{}/api/sync/servers/{}/files",
        api_base.trim_end_matches('/'),
        backend_server_id
    );
    // Long timeout for big file uploads (e.g. 100MB+)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let mut synced_count = 0usize;
    let mut current = 0usize;

    for entry in mini_files.iter() {
        current += 1;
        let full_path = base.join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let file_data = match std::fs::read(&full_path) {
            Ok(d) => d,
            Err(e) => {
                emit_progress(SyncProgressEvent {
                    server_id: server_id.clone(),
                    file_path: entry.path.clone(),
                    status: "failed".to_string(),
                    current,
                    total,
                    error: Some(e.to_string()),
                });
                continue;
            }
        };

        let hash = compute_sha256(&file_data);
        emit_progress(SyncProgressEvent {
            server_id: server_id.clone(),
            file_path: entry.path.clone(),
            status: "uploading".to_string(),
            current,
            total,
            error: None,
        });

        match upload_sync_file(
            &client,
            &url,
            &token,
            &entry.path,
            file_data,
            "mini",
            &hash,
        )
        .await
        {
            Ok(body_status) => {
                synced_count += 1;
                emit_progress(SyncProgressEvent {
                    server_id: server_id.clone(),
                    file_path: entry.path.clone(),
                    status: if body_status == "skipped" {
                        "skipped".to_string()
                    } else {
                        "done".to_string()
                    },
                    current,
                    total,
                    error: None,
                });
            }
            Err(short_err) => {
                emit_progress(SyncProgressEvent {
                    server_id: server_id.clone(),
                    file_path: entry.path.clone(),
                    status: "failed".to_string(),
                    current,
                    total,
                    error: Some(short_err),
                });
            }
        }
    }

    if include_big {
        for entry in big_files.iter() {
            current += 1;
            let full_path = base.join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
            let file_data = match std::fs::read(&full_path) {
                Ok(d) => d,
                Err(e) => {
                    emit_progress(SyncProgressEvent {
                        server_id: server_id.clone(),
                        file_path: entry.path.clone(),
                        status: "failed".to_string(),
                        current,
                        total,
                        error: Some(e.to_string()),
                    });
                    continue;
                }
            };

            let hash = compute_sha256(&file_data);
            emit_progress(SyncProgressEvent {
                server_id: server_id.clone(),
                file_path: entry.path.clone(),
                status: "uploading".to_string(),
                current,
                total,
                error: None,
            });

            match upload_sync_file(
                &client,
                &url,
                &token,
                &entry.path,
                file_data,
                "big",
                &hash,
            )
            .await
            {
                Ok(body_status) => {
                    synced_count += 1;
                    emit_progress(SyncProgressEvent {
                        server_id: server_id.clone(),
                        file_path: entry.path.clone(),
                        status: if body_status == "skipped" {
                            "skipped".to_string()
                        } else {
                            "done".to_string()
                        },
                        current,
                        total,
                        error: None,
                    });
                }
                Err(short_err) => {
                    emit_progress(SyncProgressEvent {
                        server_id: server_id.clone(),
                        file_path: entry.path.clone(),
                        status: "failed".to_string(),
                        current,
                        total,
                        error: Some(short_err),
                    });
                }
            }
        }
    }

    Ok(synced_count)
}

/// Test connectivity to the FRP server (TCP). Used by Settings to verify relay config.
#[tauri::command]
pub fn test_frp_connection(server_addr: String, server_port: u16) -> Result<(), String> {
    use std::net::ToSocketAddrs;
    let addr = format!("{}:{}", server_addr.trim(), server_port);
    let addrs = addr
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .next()
        .ok_or_else(|| "Could not resolve host.".to_string())?;
    std::net::TcpStream::connect_timeout(&addrs, std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(())
}
