const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = "iHostMC/1.0.0 (https://github.com/ihostmc/ihostmc)";

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .unwrap()
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct ModrinthHit {
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub project_type: String,
    pub icon_url: Option<String>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
pub struct ModrinthVersion {
    pub id: String,
    pub version_number: String,
    pub files: Vec<ModrinthFile>,
    pub game_versions: Vec<String>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
}

fn build_facets(
    game_version: Option<&str>,
    project_type: &str,
    loaders: Option<&[String]>,
) -> String {
    let mut parts: Vec<String> = vec![format!("[\"project_type:{}\"]", project_type)];
    if let Some(gv) = game_version {
        parts.push(format!("[\"versions:{}\"]", gv));
    }
    if let Some(loaders_list) = loaders {
        let cats: Vec<String> = loaders_list
            .iter()
            .map(|l| format!("\"categories:{}\"", l))
            .collect();
        parts.push(format!("[{}]", cats.join(",")));
    }
    format!("[{}]", parts.join(","))
}

pub async fn search_mods(
    query: &str,
    game_version: Option<&str>,
    loaders: Option<Vec<String>>,
    limit: u32,
) -> Result<Vec<ModrinthHit>, String> {
    let facets = build_facets(game_version, "mod", loaders.as_deref());
    let url = format!(
        "{}/search?query={}&limit={}&facets={}",
        MODRINTH_API,
        urlencoding::encode(query),
        limit,
        urlencoding::encode(&facets)
    );
    let c = client();
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let hits = data
        .get("hits")
        .and_then(|h| h.as_array())
        .ok_or("Invalid response")?;
    let mut out = Vec::new();
    for hit in hits {
        if let Ok(p) = serde_json::from_value::<ModrinthHit>(hit.clone()) {
            out.push(p);
        }
    }
    Ok(out)
}

pub async fn search_plugins(
    query: &str,
    game_version: Option<&str>,
    limit: u32,
) -> Result<Vec<ModrinthHit>, String> {
    let facets = build_facets(game_version, "plugin", None);
    let url = format!(
        "{}/search?query={}&limit={}&facets={}",
        MODRINTH_API,
        urlencoding::encode(query),
        limit,
        urlencoding::encode(&facets)
    );
    let c = client();
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let hits = data
        .get("hits")
        .and_then(|h| h.as_array())
        .ok_or("Invalid response")?;
    let mut out = Vec::new();
    for hit in hits {
        if let Ok(p) = serde_json::from_value::<ModrinthHit>(hit.clone()) {
            out.push(p);
        }
    }
    Ok(out)
}

pub async fn get_version_download_url(
    project_slug_or_id: &str,
    game_version: &str,
) -> Result<String, String> {
    let url = format!("{}/project/{}/version", MODRINTH_API, project_slug_or_id);
    let c = client();
    let resp = c.get(&url).send().await.map_err(|e| e.to_string())?;
    let versions: Vec<ModrinthVersion> = resp.json().await.map_err(|e| e.to_string())?;
    let version = versions
        .iter()
        .find(|v| v.game_versions.iter().any(|gv| gv == game_version))
        .or(versions.first())
        .ok_or("No version found")?;
    let file = version
        .files
        .iter()
        .find(|f| f.primary)
        .or(version.files.first())
        .ok_or("No file in version")?;
    Ok(file.url.clone())
}
