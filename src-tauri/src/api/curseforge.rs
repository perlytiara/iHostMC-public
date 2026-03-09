const CURSEFORGE_API: &str = "https://api.curseforge.com/v1";
const MINECRAFT_GAME_ID: u32 = 432;
const CLASS_MODS: u32 = 6;
const CLASS_BUKKIT_PLUGINS: u32 = 5;

fn client(api_key: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("iHostMC/1.0.0")
        .default_headers({
            let mut h = reqwest::header::HeaderMap::new();
            h.insert(
                "x-api-key",
                reqwest::header::HeaderValue::from_str(api_key)
                    .map_err(|e| format!("Invalid API key: {}", e))?,
            );
            h
        })
        .build()
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeHit {
    pub id: u64,
    pub name: String,
    pub slug: String,
    pub summary: Option<String>,
    pub logo: Option<CurseForgeLogo>,
    pub download_count: Option<f64>,
    pub class_id: Option<u32>,
}

#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeLogo {
    pub thumbnail_url: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeSearchResponse {
    data: Vec<CurseForgeHit>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeFilesResponse {
    data: Vec<CurseForgeFile>,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CurseForgeFile {
    pub id: u64,
    pub file_name: String,
    pub download_url: Option<String>,
    pub game_versions: Vec<String>,
}

pub async fn search_mods(
    api_key: &str,
    query: &str,
    game_version: Option<&str>,
    limit: u32,
) -> Result<Vec<CurseForgeHit>, String> {
    search(api_key, query, game_version, CLASS_MODS, limit).await
}

pub async fn search_plugins(
    api_key: &str,
    query: &str,
    game_version: Option<&str>,
    limit: u32,
) -> Result<Vec<CurseForgeHit>, String> {
    search(api_key, query, game_version, CLASS_BUKKIT_PLUGINS, limit).await
}

async fn search(
    api_key: &str,
    query: &str,
    game_version: Option<&str>,
    class_id: u32,
    limit: u32,
) -> Result<Vec<CurseForgeHit>, String> {
    let c = client(api_key)?;
    let mut url = format!(
        "{}/mods/search?gameId={}&classId={}&searchFilter={}&pageSize={}&sortField=2&sortOrder=desc",
        CURSEFORGE_API,
        MINECRAFT_GAME_ID,
        class_id,
        urlencoding::encode(query),
        limit,
    );
    if let Some(gv) = game_version {
        url.push_str(&format!("&gameVersion={}", urlencoding::encode(gv)));
    }
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let hint = if resp.status() == reqwest::StatusCode::FORBIDDEN {
            " (invalid/expired API key – get a new key at https://console.curseforge.com and set CURSEFORGE_API_KEY in backend .env, then restart)"
        } else {
            ""
        };
        return Err(format!("CurseForge API error: {}{}", resp.status(), hint));
    }
    let data: CurseForgeSearchResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data.data)
}

pub async fn get_download_url(
    api_key: &str,
    mod_id: u64,
    game_version: &str,
) -> Result<String, String> {
    let c = client(api_key)?;
    let url = format!(
        "{}/mods/{}/files?gameVersion={}&pageSize=5",
        CURSEFORGE_API,
        mod_id,
        urlencoding::encode(game_version),
    );
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let hint = if resp.status() == reqwest::StatusCode::FORBIDDEN {
            " (invalid/expired API key – get a new key at https://console.curseforge.com and set CURSEFORGE_API_KEY in backend .env, then restart)"
        } else {
            ""
        };
        return Err(format!("CurseForge API error: {}{}", resp.status(), hint));
    }
    let data: CurseForgeFilesResponse = resp.json().await.map_err(|e| e.to_string())?;
    let file = data
        .data
        .iter()
        .find(|f| f.download_url.is_some())
        .or(data.data.first())
        .ok_or("No files found for this version")?;
    file.download_url
        .clone()
        .ok_or_else(|| "Download URL not available (third-party distribution disabled)".to_string())
}
