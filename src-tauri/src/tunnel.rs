//! Share server via iHostMC relay (frp). Assigns a port on the relay, runs frpc to expose local server.

use crate::download;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const FRP_VERSION: &str = "0.67.0";

/// Config for frp tunnel (self-hosted relay). Pass from frontend when method is "frp".
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrpConfig {
    /// Base URL of the port-assignment API (e.g. "http://1.2.3.4:8080")
    pub api_base_url: String,
    /// frps server address (host or IP)
    pub server_addr: String,
    /// frps server port (default 7000)
    pub server_port: u16,
    /// Auth token (same as FRP_API_TOKEN on server)
    pub token: String,
}

/// Info needed to release an frp port when stopping the tunnel.
struct FrpReleaseInfo {
    api_base_url: String,
    port: u16,
    token: String,
}

struct TunnelProcess {
    child: Child,
    public_url: String,
    frp_release: Option<FrpReleaseInfo>,
}

pub struct TunnelState(Mutex<Option<TunnelProcess>>);

impl Default for TunnelState {
    fn default() -> Self {
        TunnelState(Mutex::new(None))
    }
}

/// Start relay tunnel. Assigns a port on the iHostMC relay and runs frpc. Returns public address (host:port).
#[tauri::command]
pub async fn start_tunnel(
    app: AppHandle,
    state: tauri::State<'_, TunnelState>,
    port: u16,
    _method: String,
    frp_config: Option<FrpConfig>,
) -> Result<String, String> {
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Err("Tunnels are only supported on Windows, macOS, and Linux.".to_string());

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        // Stop any existing tunnel
        let _ = stop_tunnel_inner(state.0.lock().unwrap().take());

        let cfg = frp_config.ok_or_else(|| "Relay config required.".to_string())?;
        if cfg.api_base_url.is_empty() || cfg.server_addr.is_empty() || cfg.token.is_empty() {
            return Err("Relay: api_base_url, server_addr, and token are required.".to_string());
        }
        let _ = app.emit("tunnel-progress", "preparing");
        let frpc_path = ensure_frpc(Some(&app)).await?;
        let _ = app.emit("tunnel-progress", "connecting");
        let (child, url, release_info) = start_frp_blocking(port, &frpc_path, &cfg).await?;
        state.0.lock().unwrap().replace(TunnelProcess {
            child,
            public_url: url.clone(),
            frp_release: Some(release_info),
        });
        Ok(url)
    }
}

fn stop_tunnel_inner(taken: Option<TunnelProcess>) -> Result<(), String> {
    if let Some(mut proc) = taken {
        if let Some(frp) = proc.frp_release {
            let url = format!(
                "{}/release-port/{}",
                frp.api_base_url.trim_end_matches('/'),
                frp.port
            );
            let client = reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .map_err(|e| e.to_string())?;
            let _ = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", frp.token))
                .send();
        }
        let _ = proc.child.kill();
    }
    Ok(())
}

/// Stop the current tunnel if any.
#[tauri::command]
pub fn stop_tunnel(state: tauri::State<'_, TunnelState>) -> Result<(), String> {
    stop_tunnel_inner(state.0.lock().unwrap().take())
}

/// Get the current tunnel public URL if one is active.
#[tauri::command]
pub fn get_tunnel_public_url(state: tauri::State<'_, TunnelState>) -> Option<String> {
    state
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.public_url.clone())
}

// ---------- frp relay ----------

fn frp_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ihostmc")
        .join("frp")
}

#[cfg(target_os = "windows")]
fn frpc_binary_name() -> &'static str {
    "frpc.exe"
}

#[cfg(not(target_os = "windows"))]
fn frpc_binary_name() -> &'static str {
    "frpc"
}

fn frp_download_url() -> Option<String> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_windows_amd64.zip",
        FRP_VERSION, FRP_VERSION
    ));
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_windows_arm64.zip",
        FRP_VERSION, FRP_VERSION
    ));
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_darwin_amd64.tar.gz",
        FRP_VERSION, FRP_VERSION
    ));
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_darwin_arm64.tar.gz",
        FRP_VERSION, FRP_VERSION
    ));
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_linux_amd64.tar.gz",
        FRP_VERSION, FRP_VERSION
    ));
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_linux_arm64.tar.gz",
        FRP_VERSION, FRP_VERSION
    ));
    #[cfg(all(target_os = "linux", target_arch = "arm"))]
    return Some(format!(
        "https://github.com/fatedier/frp/releases/download/v{}/frp_{}_linux_arm.tar.gz",
        FRP_VERSION, FRP_VERSION
    ));
    #[allow(unreachable_code)]
    None
}

/// Ensure frpc binary exists; download if needed. Returns path to frpc.
async fn ensure_frpc(progress: Option<&AppHandle>) -> Result<PathBuf, String> {
    let dir = frp_dir();
    let name = frpc_binary_name();
    let binary_path = dir.join(name);
    if binary_path.exists() {
        return Ok(binary_path);
    }
    let url =
        frp_download_url().ok_or_else(|| "frp is not available for this platform.".to_string())?;
    if let Some(app) = progress {
        let _ = app.emit("tunnel-progress", "downloading");
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if url.ends_with(".zip") {
        let zip_path = dir.join("frp.zip");
        download::download_file(&url, &zip_path).await?;
        extract_frpc_from_zip(&zip_path, &dir)?;
        let _ = std::fs::remove_file(zip_path);
    } else {
        let tar_path = dir.join("frp.tar.gz");
        download::download_file(&url, &tar_path).await?;
        extract_frpc_from_tar_gz(&tar_path, &dir)?;
        let _ = std::fs::remove_file(tar_path);
    }
    if binary_path.exists() {
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&binary_path)
                .map_err(|e| e.to_string())?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&binary_path, perms).map_err(|e| e.to_string())?;
        }
        Ok(binary_path)
    } else {
        Err("frp download failed: binary not found.".to_string())
    }
}

fn extract_frpc_from_zip(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let name = frpc_binary_name();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_name = entry.name().replace('\\', "/");
        if entry_name.ends_with(name) {
            let out_path = out_dir.join(name);
            let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("frp zip contained no frpc executable.".to_string())
}

fn extract_frpc_from_tar_gz(tar_path: &Path, out_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(tar_path).map_err(|e| e.to_string())?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);
    let name = frpc_binary_name();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut e = entry.map_err(|e| e.to_string())?;
        let path = e.path().map_err(|e| e.to_string())?;
        if path.ends_with(name) {
            let out_path = out_dir.join(name);
            let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut e, &mut out).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("frp tarball contained no frpc executable.".to_string())
}

/// Assign a port from the API, write frpc.toml, run frpc. Returns (child, "host:port", release_info).
async fn start_frp_blocking(
    local_port: u16,
    frpc_path: &Path,
    cfg: &FrpConfig,
) -> Result<(Child, String, FrpReleaseInfo), String> {
    let base = cfg.api_base_url.trim_end_matches('/');
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("{}/assign-port", base))
        .header("Authorization", format!("Bearer {}", cfg.token))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("assign-port failed ({}): {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let remote_port = json
        .get("port")
        .and_then(|p| p.as_u64())
        .ok_or_else(|| "assign-port did not return port".to_string())? as u16;

    let release_info = FrpReleaseInfo {
        api_base_url: cfg.api_base_url.clone(),
        port: remote_port,
        token: cfg.token.clone(),
    };

    let user_id = uuid::Uuid::new_v4().simple().to_string();
    let toml = format!(
        r#"# Stay alive and retry when frps restarts or connection drops
loginFailExit = false
# Send heartbeats often so server does not disconnect (server timeout is 180s)
transport.heartbeatInterval = 20

serverAddr = "{}"
serverPort = {}
auth.method = "token"
auth.token = "{}"

[[proxies]]
name = "minecraft_tcp_{}"
type = "tcp"
localIP = "127.0.0.1"
localPort = {}
remotePort = {}

[[proxies]]
name = "minecraft_udp_{}"
type = "udp"
localIP = "127.0.0.1"
localPort = {}
remotePort = {}
"#,
        cfg.server_addr,
        cfg.server_port,
        cfg.token,
        user_id,
        local_port,
        remote_port,
        user_id,
        local_port,
        remote_port,
    );

    let dir = frp_dir();
    let config_path = dir.join("frpc.toml");
    std::fs::write(&config_path, &toml).map_err(|e| e.to_string())?;

    let child = match Command::new(frpc_path)
        .args(["-c", config_path.to_str().unwrap_or("frpc.toml")])
        .current_dir(&dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let code = e.raw_os_error();
            let msg = e.to_string();
            let blocked = code == Some(4556)
                || msg.contains("4556")
                || msg.to_lowercase().contains("blocked")
                || msg.to_lowercase().contains("reputation")
                || msg.contains("Anwendungssteuerung");
            return Err(if blocked {
                "Windows hat die Relay-Tool-Datei blockiert (Anwendungssteuerung / bösartige Binärreputation). Bitte den Ordner %LOCALAPPDATA%\\ihostmc in Windows-Sicherheit als Ausschluss hinzufügen oder frpc.exe dort entsperren. Siehe docs/code-signing-windows.md.".to_string()
            } else {
                msg
            });
        }
    };

    let public_url = format!("{}:{}", cfg.server_addr, remote_port);
    Ok((child, public_url, release_info))
}
