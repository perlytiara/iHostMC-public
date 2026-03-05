//! NeoForge: version list from Maven metadata or static list; installer JAR + --installServer.

const NEOFORGE_MAVEN_BASE: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";

/// Known stable NeoForge versions (NeoForge uses single version string e.g. 20.4.167).
/// We could parse maven-metadata.xml or index; for now use a curated list of stable versions.
fn stable_versions() -> Vec<String> {
    vec![
        "21.1.209".to_string(),
        "21.1.198".to_string(),
        "21.1.188".to_string(),
        "21.1.177".to_string(),
        "21.1.167".to_string(),
        "21.1.157".to_string(),
        "21.0.160".to_string(),
        "21.0.150".to_string(),
        "21.0.143".to_string(),
        "20.6.139".to_string(),
        "20.6.130".to_string(),
        "20.6.120".to_string(),
        "20.6.115".to_string(),
        "20.4.199".to_string(),
        "20.4.189".to_string(),
        "20.4.179".to_string(),
        "20.4.167".to_string(),
        "20.2.86".to_string(),
    ]
}

pub async fn fetch_versions() -> Result<Vec<String>, String> {
    Ok(stable_versions())
}

/// Minecraft version to NeoForge version prefix (e.g. 1.21.1 -> "21", 1.20.6 -> "20.6").
fn mc_version_to_neoforge_prefix(mc: &str) -> Option<String> {
    let strip = mc.strip_prefix("1.")?;
    if strip.starts_with("21") {
        return Some("21".to_string());
    }
    if strip.starts_with("20.6") {
        return Some("20.6".to_string());
    }
    if strip.starts_with("20.4") {
        return Some("20.4".to_string());
    }
    if strip.starts_with("20.2") {
        return Some("20.2".to_string());
    }
    None
}

/// NeoForge versions compatible with the given Minecraft version (filtered).
pub async fn fetch_versions_for_game(minecraft_version: &str) -> Result<Vec<String>, String> {
    let prefix = mc_version_to_neoforge_prefix(minecraft_version)
        .ok_or_else(|| format!("NeoForge not available for Minecraft {}", minecraft_version))?;
    let all = stable_versions();
    let filtered: Vec<String> = all
        .into_iter()
        .filter(|v| v.starts_with(&format!("{}.", prefix)) || v == &prefix)
        .collect();
    if filtered.is_empty() {
        return Err(format!(
            "No NeoForge version for Minecraft {}",
            minecraft_version
        ));
    }
    Ok(filtered)
}

/// URL to download the NeoForge installer JAR (run with --installServer).
pub fn installer_jar_url(version: &str) -> String {
    format!(
        "{}/{}/neoforge-{}-installer.jar",
        NEOFORGE_MAVEN_BASE, version, version
    )
}
