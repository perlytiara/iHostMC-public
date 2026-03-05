const PAPER_FILL_API: &str = "https://api.papermc.io/v2/projects/paper";
const USER_AGENT: &str = "iHostMC/1.0.0 (https://github.com/ihostmc/ihostmc)";

#[derive(serde::Deserialize)]
pub struct PaperVersionList {
    pub versions: Vec<String>,
}

#[derive(serde::Deserialize)]
pub struct BuildsList {
    pub builds: Vec<i64>,
}

#[derive(serde::Deserialize)]
pub struct BuildDetails {
    pub downloads: BuildDownloads,
}

#[derive(serde::Deserialize)]
pub struct BuildDownloads {
    pub application: BuildApplication,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
pub struct BuildApplication {
    pub name: String,
    pub sha256: String,
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .unwrap()
}

pub async fn fetch_versions() -> Result<Vec<String>, String> {
    let c = client();
    let resp = c
        .get(PAPER_FILL_API)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let list: PaperVersionList = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.versions)
}

pub async fn fetch_latest_build(version: &str) -> Result<i64, String> {
    let url = format!("{}/versions/{}", PAPER_FILL_API, version);
    let c = client();
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    let list: BuildsList = resp.json().await.map_err(|e| e.to_string())?;
    list.builds
        .last()
        .copied()
        .ok_or_else(|| format!("No builds for Paper {}", version))
}

pub async fn fetch_jar_download_url(version: &str, build: i64) -> Result<String, String> {
    let url = format!("{}/versions/{}/builds/{}", PAPER_FILL_API, version, build);
    let c = client();
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    let details: BuildDetails = resp.json().await.map_err(|e| e.to_string())?;
    let name = details.downloads.application.name;
    let download_url = format!(
        "{}/versions/{}/builds/{}/downloads/{}",
        PAPER_FILL_API, version, build, name
    );
    Ok(download_url)
}

pub async fn get_jar_url(version: &str) -> Result<String, String> {
    let build = fetch_latest_build(version).await?;
    fetch_jar_download_url(version, build).await
}
