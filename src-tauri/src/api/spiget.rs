const SPIGET_API: &str = "https://api.spiget.org/v2";

#[derive(serde::Deserialize, serde::Serialize)]
pub struct SpigetResource {
    pub id: u64,
    pub name: String,
    pub tag: Option<String>,
    pub version: Option<SpigetVersion>,
    pub premium: Option<bool>,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct SpigetVersion {
    pub id: u64,
    pub name: String,
}

pub async fn search_resources(query: &str, size: u32) -> Result<Vec<SpigetResource>, String> {
    let url = format!(
        "{}/search/resources/{}?size={}&field=name",
        SPIGET_API,
        urlencoding::encode(query),
        size
    );
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let list: Vec<SpigetResource> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list)
}

pub fn download_url(resource_id: u64) -> String {
    format!("{}/resources/{}/download", SPIGET_API, resource_id)
}

#[allow(dead_code)]
pub fn is_premium(resource: &SpigetResource) -> bool {
    resource.premium.unwrap_or(false)
}
