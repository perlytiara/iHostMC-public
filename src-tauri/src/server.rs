use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub type ServerId = String;

fn default_port() -> u16 {
    25565
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: ServerId,
    pub name: String,
    pub server_type: ServerType,
    pub minecraft_version: String,
    pub memory_mb: u32,
    #[serde(default = "default_port")]
    pub port: u16,
    pub java_path: Option<String>,
    #[serde(with = "path_serde")]
    pub path: PathBuf,
    #[serde(default)]
    pub trashed_at: Option<String>,
}

mod path_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::path::PathBuf;
    pub fn serialize<S: Serializer>(p: &PathBuf, s: S) -> Result<S::Ok, S::Error> {
        p.to_string_lossy().serialize(s)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<PathBuf, D::Error> {
        let s = String::deserialize(d)?;
        Ok(PathBuf::from(s))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerType {
    Vanilla,
    Paper,
    Purpur,
    Fabric,
    Forge,
    NeoForge,
    Quilt,
    Spigot,
    Bukkit,
}

impl std::fmt::Display for ServerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServerType::Vanilla => write!(f, "Vanilla"),
            ServerType::Paper => write!(f, "Paper"),
            ServerType::Purpur => write!(f, "Purpur"),
            ServerType::Fabric => write!(f, "Fabric"),
            ServerType::Forge => write!(f, "Forge"),
            ServerType::NeoForge => write!(f, "NeoForge"),
            ServerType::Quilt => write!(f, "Quilt"),
            ServerType::Spigot => write!(f, "Spigot"),
            ServerType::Bukkit => write!(f, "Bukkit"),
        }
    }
}

fn app_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ihostmc")
}

pub fn servers_dir() -> PathBuf {
    app_data_dir().join("servers")
}

pub fn java_dir() -> PathBuf {
    app_data_dir().join("java")
}

pub fn servers_config_path() -> PathBuf {
    app_data_dir().join("servers.json")
}

pub fn preferences_path() -> PathBuf {
    app_data_dir().join("preferences.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    #[serde(default = "default_run_in_background")]
    pub run_in_background: bool,
    #[serde(default)]
    pub curseforge_api_key: Option<String>,
}

fn default_run_in_background() -> bool {
    true
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            run_in_background: true,
            curseforge_api_key: None,
        }
    }
}

pub fn load_preferences() -> Preferences {
    let path = preferences_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(prefs) = serde_json::from_str::<Preferences>(&data) {
                return prefs;
            }
        }
    }
    Preferences::default()
}

pub fn save_preferences(prefs: &Preferences) {
    let path = preferences_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string_pretty(prefs) {
        let _ = std::fs::write(&path, data);
    }
}

pub async fn ensure_app_dirs() {
    let servers = servers_dir();
    let java = java_dir();
    let _ = tokio::fs::create_dir_all(&servers).await;
    let _ = tokio::fs::create_dir_all(&java).await;
}

fn load_servers_list() -> Vec<ServerConfig> {
    let path = servers_config_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(list) = serde_json::from_str::<Vec<ServerConfig>>(&data) {
                return list;
            }
        }
    }
    Vec::new()
}

fn save_servers_list(servers: &[ServerConfig]) {
    let path = servers_config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string_pretty(servers) {
        let _ = std::fs::write(&path, data);
    }
}

lazy_static::lazy_static! {
    static ref SERVERS: Mutex<Vec<ServerConfig>> = Mutex::new(load_servers_list());
}

pub fn list_servers() -> Vec<ServerConfig> {
    SERVERS.lock().unwrap().clone()
}

pub fn get_server(id: &str) -> Option<ServerConfig> {
    SERVERS.lock().unwrap().iter().find(|s| s.id == id).cloned()
}

pub fn add_server(config: ServerConfig) {
    let mut list = SERVERS.lock().unwrap();
    if !list.iter().any(|s| s.id == config.id) {
        list.push(config);
        save_servers_list(&list);
    }
}

pub fn remove_server(id: &str) -> bool {
    let mut list = SERVERS.lock().unwrap();
    if let Some(pos) = list.iter().position(|s| s.id == id) {
        list.remove(pos);
        save_servers_list(&list);
        true
    } else {
        false
    }
}

/// Move server to trash (soft delete). Returns true if updated.
pub fn trash_server(id: &str) -> bool {
    let mut list = SERVERS.lock().unwrap();
    if let Some(s) = list.iter_mut().find(|s| s.id == id) {
        s.trashed_at = Some(chrono::Utc::now().to_rfc3339());
        save_servers_list(&list);
        true
    } else {
        false
    }
}

/// Restore server from trash. Returns true if updated.
pub fn restore_server(id: &str) -> bool {
    let mut list = SERVERS.lock().unwrap();
    if let Some(s) = list.iter_mut().find(|s| s.id == id) {
        s.trashed_at = None;
        save_servers_list(&list);
        true
    } else {
        false
    }
}

pub fn rename_server(id: &str, new_name: &str) -> Result<(), String> {
    let name = new_name.trim();
    if name.is_empty() {
        return Err("Name darf nicht leer sein".to_string());
    }
    let mut list = SERVERS.lock().unwrap();
    if let Some(s) = list.iter_mut().find(|s| s.id == id) {
        s.name = name.to_string();
        save_servers_list(&list);
        Ok(())
    } else {
        Err("Server nicht gefunden".to_string())
    }
}

pub fn update_server_port(id: &str, new_port: u16) -> Result<(), String> {
    let mut list = SERVERS.lock().unwrap();
    if let Some(s) = list.iter_mut().find(|s| s.id == id) {
        s.port = new_port;
        save_servers_list(&list);
        Ok(())
    } else {
        Err("Server not found".to_string())
    }
}

pub fn server_dir(id: &str) -> PathBuf {
    servers_dir().join(id)
}
