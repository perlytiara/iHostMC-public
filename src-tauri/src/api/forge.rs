//! Forge: promotions_slim.json for version list, then installer JAR + --installServer.

const FORGE_PROMOS: &str =
    "https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json";
const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";

#[derive(serde::Deserialize)]
pub struct PromosSlim {
    pub promos: std::collections::HashMap<String, String>,
}

/// Returns Minecraft versions that have a Forge build (from promos keys like "1.21.1-recommended").
pub async fn fetch_minecraft_versions() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(FORGE_PROMOS)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Forge API returned {}", resp.status()));
    }
    let data: PromosSlim = resp.json().await.map_err(|e| e.to_string())?;
    let mut versions: Vec<String> = data
        .promos
        .keys()
        .filter_map(|k| {
            let v = k
                .strip_suffix("-latest")
                .or_else(|| k.strip_suffix("-recommended"))?;
            if v.chars().next().map(|c| c.is_ascii_digit()) == Some(true) {
                Some(v.to_string())
            } else {
                None
            }
        })
        .collect();
    versions.dedup();
    crate::api::version_sort::sort_versions_newest_first(&mut versions);
    Ok(versions)
}

/// Get Forge version string for a Minecraft version (e.g. "1.21.1" -> "52.1.0" from "1.21.1-recommended").
pub async fn get_forge_version(minecraft_version: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(FORGE_PROMOS)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Forge API returned {}", resp.status()));
    }
    let data: PromosSlim = resp.json().await.map_err(|e| e.to_string())?;
    let key = format!("{}-recommended", minecraft_version);
    let forge_build = data
        .promos
        .get(&key)
        .or_else(|| data.promos.get(&format!("{}-latest", minecraft_version)))
        .cloned()
        .ok_or_else(|| format!("No Forge build for Minecraft {}", minecraft_version))?;
    Ok(forge_build)
}

/// Full Forge version string: "1.21.1-52.1.0"
pub async fn get_full_forge_version(minecraft_version: &str) -> Result<String, String> {
    let build = get_forge_version(minecraft_version).await?;
    Ok(format!("{}-{}", minecraft_version, build))
}

/// Build option for the UI: (version number, display label).
#[derive(serde::Serialize)]
pub struct ForgeBuildOption {
    pub version: String,
    pub label: String,
}

/// Returns Forge build options for a Minecraft version (recommended + latest).
pub async fn fetch_builds_for_game(
    minecraft_version: &str,
) -> Result<Vec<ForgeBuildOption>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(FORGE_PROMOS)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Forge API returned {}", resp.status()));
    }
    let data: PromosSlim = resp.json().await.map_err(|e| e.to_string())?;
    let mut options = Vec::new();
    let rec_key = format!("{}-recommended", minecraft_version);
    let lat_key = format!("{}-latest", minecraft_version);
    if let Some(rec) = data.promos.get(&rec_key) {
        options.push(ForgeBuildOption {
            version: rec.clone(),
            label: format!("{} (recommended)", rec),
        });
    }
    if let Some(lat) = data.promos.get(&lat_key) {
        if !options.iter().any(|o| o.version == *lat) {
            options.push(ForgeBuildOption {
                version: lat.clone(),
                label: format!("{} (latest)", lat),
            });
        }
    }
    if options.is_empty() {
        return Err(format!(
            "No Forge build for Minecraft {}",
            minecraft_version
        ));
    }
    Ok(options)
}

/// URL to download the Forge installer JAR (run with --installServer).
pub async fn installer_jar_url(minecraft_version: &str) -> Result<String, String> {
    let full = get_full_forge_version(minecraft_version).await?;
    Ok(format!(
        "{}/{}/forge-{}-installer.jar",
        FORGE_MAVEN, full, full
    ))
}

/// Installer URL when user chose a specific Forge build (e.g. "52.1.10").
pub async fn installer_jar_url_with_build(
    minecraft_version: &str,
    forge_build: Option<&str>,
) -> Result<String, String> {
    let build = match forge_build {
        Some(b) => b.to_string(),
        None => get_forge_version(minecraft_version).await?,
    };
    let full = format!("{}-{}", minecraft_version, build);
    Ok(format!(
        "{}/{}/forge-{}-installer.jar",
        FORGE_MAVEN, full, full
    ))
}
