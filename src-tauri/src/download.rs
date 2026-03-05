use std::path::Path;

pub async fn download_file(url: &str, path: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("iHostMC/1.0.0 (https://github.com/ihostmc/ihostmc)")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}
