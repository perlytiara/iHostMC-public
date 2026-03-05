const PURPUR_API: &str = "https://api.purpurmc.org/v2/purpur";

#[derive(serde::Deserialize)]
pub struct PurpurVersionList {
    pub versions: Vec<String>,
}

pub async fn fetch_versions() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(PURPUR_API)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let list: PurpurVersionList = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.versions)
}

pub fn download_url(version: &str) -> String {
    format!("{}/{}/latest/download", PURPUR_API, version)
}
