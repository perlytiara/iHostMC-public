//! Quilt: use Fabric-compatible game versions; Quilt installer or server jar from Quilt meta if available.
//! Fallback: point users to quiltmc.org or use a minimal version list.

/// Quilt supports similar MC versions to Fabric. We reuse Fabric game versions for the list.
/// Server installation: Quilt has an installer (install server command). For now we expose
/// game versions and document that server setup may require running the Quilt installer manually,
/// or we could shell out to the Quilt installer JAR when we have a stable API.
pub async fn fetch_game_versions() -> Result<Vec<String>, String> {
    // Quilt uses same Minecraft versions as Fabric for compatibility
    crate::api::fabric::fetch_game_versions().await
}

/// Quilt loader versions - Quilt meta might be at different URL. Placeholder: return empty or use Fabric.
pub async fn fetch_loader_versions() -> Result<Vec<String>, String> {
    // TODO: Quilt meta API when available (e.g. meta.quiltmc.org)
    Ok(vec![])
}

/// Quilt installer download - not implemented yet; create_server for Quilt could show message or use external installer.
pub fn installer_jar_url(_game_version: &str, _loader_version: &str) -> Option<String> {
    None
}
