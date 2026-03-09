const FABRIC_META: &str = "https://meta.fabricmc.net/v2";

#[derive(serde::Deserialize)]
pub struct GameVersionList {
    pub version: String,
}

pub async fn fetch_game_versions() -> Result<Vec<String>, String> {
    let url = format!("{}/versions/game", FABRIC_META);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Fabric API returned {}", resp.status()));
    }
    let list: Vec<GameVersionList> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.into_iter().map(|v| v.version).collect())
}

#[derive(serde::Deserialize)]
pub struct LoaderVersion {
    pub version: String,
}

pub async fn fetch_loader_versions() -> Result<Vec<String>, String> {
    let url = format!("{}/versions/loader", FABRIC_META);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Fabric API returned {}", resp.status()));
    }
    let list: Vec<LoaderVersion> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.into_iter().map(|v| v.version).collect())
}

/// Loader versions compatible with a specific game version (filtered by Fabric API).
#[derive(serde::Deserialize)]
struct LoaderEntry {
    loader: LoaderVersion,
}

pub async fn fetch_loader_versions_for_game(game_version: &str) -> Result<Vec<String>, String> {
    let encoded = urlencoding::encode(game_version);
    let url = format!("{}/versions/loader/{}", FABRIC_META, encoded);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Fabric API returned {}", resp.status()));
    }
    let list: Vec<LoaderEntry> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.into_iter().map(|e| e.loader.version).collect())
}

#[derive(serde::Deserialize)]
pub struct InstallerVersion {
    pub version: String,
}

pub async fn fetch_installer_versions() -> Result<Vec<String>, String> {
    let url = format!("{}/versions/installer", FABRIC_META);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Fabric API returned {}", resp.status()));
    }
    let list: Vec<InstallerVersion> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.into_iter().map(|v| v.version).collect())
}

/// Server jar URL requires game_version, loader_version, and installer_version (v2 API).
pub async fn fetch_server_jar_url(
    game_version: &str,
    loader_version: &str,
    installer_version: &str,
) -> Result<String, String> {
    let encoded_game = urlencoding::encode(game_version);
    let encoded_loader = urlencoding::encode(loader_version);
    let encoded_installer = urlencoding::encode(installer_version);
    let url = format!(
        "{}/versions/loader/{}/{}/{}/server/jar",
        FABRIC_META, encoded_game, encoded_loader, encoded_installer
    );
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let final_url = resp.url().as_str().to_string();
    if resp.status().is_redirection() || resp.status().is_success() {
        Ok(final_url)
    } else {
        Err(format!("Fabric API returned {}", resp.status()))
    }
}

pub async fn get_jar_url(game_version: &str) -> Result<String, String> {
    get_jar_url_with_versions(game_version, None, None).await
}

/// Build server jar URL with optional loader and installer (defaults to latest).
pub async fn get_jar_url_with_versions(
    game_version: &str,
    loader_version: Option<&str>,
    installer_version: Option<&str>,
) -> Result<String, String> {
    let (loaders, installers) =
        tokio::try_join!(fetch_loader_versions(), fetch_installer_versions())?;
    let loader = loader_version
        .map(String::from)
        .or_else(|| loaders.first().cloned())
        .ok_or("No Fabric loader versions")?;
    let installer = installer_version
        .map(String::from)
        .or_else(|| installers.first().cloned())
        .ok_or("No Fabric installer versions")?;
    fetch_server_jar_url(game_version, &loader, &installer).await
}
