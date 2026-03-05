// ServerJars.org provides pre-built Spigot and CraftBukkit JARs.
// Version list matches Mojang releases; download URLs follow their path pattern.
// See: https://serverjars.org

const SERVERJARS_BASE: &str = "https://serverjars.org";

/// Direct download URL for a Spigot server JAR at the given Minecraft version.
/// ServerJars uses path pattern: /download/spigot/{version}
pub fn spigot_download_url(version: &str) -> String {
    format!("{}/download/spigot/{}", SERVERJARS_BASE, version)
}

/// Direct download URL for a CraftBukkit server JAR at the given Minecraft version.
/// ServerJars uses path pattern: /download/craftbukkit/{version}
pub fn craftbukkit_download_url(version: &str) -> String {
    format!("{}/download/craftbukkit/{}", SERVERJARS_BASE, version)
}
