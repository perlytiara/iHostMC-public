const VERSION_MANIFEST: &str = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(serde::Deserialize)]
pub struct VersionManifest {
    pub versions: Vec<VersionEntry>,
}

#[derive(serde::Deserialize)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub url: String,
}

#[derive(serde::Deserialize)]
pub struct VersionDetails {
    pub downloads: VersionDownloads,
}

#[derive(serde::Deserialize)]
pub struct VersionDownloads {
    pub server: Option<ServerDownload>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
pub struct ServerDownload {
    pub url: String,
    pub sha1: String,
}

pub async fn fetch_manifest() -> Result<VersionManifest, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(VERSION_MANIFEST)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let manifest: VersionManifest = resp.json().await.map_err(|e| e.to_string())?;
    Ok(manifest)
}

pub fn release_versions(manifest: &VersionManifest) -> Vec<String> {
    manifest
        .versions
        .iter()
        .filter(|v| v.type_ == "release")
        .map(|v| v.id.clone())
        .collect()
}

pub async fn fetch_server_download_url(version_id: &str) -> Result<String, String> {
    let manifest = fetch_manifest().await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Version {} not found", version_id))?;
    let client = reqwest::Client::new();
    let resp = client
        .get(&entry.url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let details: VersionDetails = resp.json().await.map_err(|e| e.to_string())?;
    let server = details
        .downloads
        .server
        .ok_or_else(|| format!("No server jar for version {}", version_id))?;
    Ok(server.url)
}
