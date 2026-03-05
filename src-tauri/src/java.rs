use std::path::{Path, PathBuf};

use crate::server;

/// Minimum Java version required for modern Minecraft servers (1.21+).
pub const MIN_JAVA_VERSION: u32 = 21;

/// Get Java major version by running `java -version`. Returns None if detection fails.
pub fn get_java_version(java_path: &Path) -> Option<u32> {
    let output = std::process::Command::new(java_path)
        .arg("-version")
        .output()
        .ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_java_version(&stderr).or_else(|| parse_java_version(&stdout))
}

fn parse_java_version(output: &str) -> Option<u32> {
    // Match "version "21.0.1"" or "version "17.0.9"" or "version "1.8.0_301""
    for line in output.lines() {
        if let Some(idx) = line.find("version \"") {
            let rest = &line[idx + 9..]; // after 'version "'
            let end = rest.find('"').unwrap_or(rest.len());
            let vers = &rest[..end];
            let mut parts = vers.split('.');
            let first: u32 = parts.next()?.parse().ok()?;
            let major = if first == 1 {
                // Java 8: "1.8.0_301" -> 8
                parts.next()?.parse().ok()?
            } else {
                first
            };
            return Some(major);
        }
    }
    None
}

pub fn resolve_java_path(server_java_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = server_java_path {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
        let with_bin = path.join("bin").join(java_exe_name());
        if with_bin.is_file() {
            return Ok(with_bin);
        }
        return Err(format!("Java not found at {}", p));
    }
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let path = PathBuf::from(java_home).join("bin").join(java_exe_name());
        if path.is_file() {
            return Ok(path);
        }
    }
    which_java()
}

#[cfg(windows)]
fn java_exe_name() -> &'static str {
    "java.exe"
}

#[cfg(not(windows))]
fn java_exe_name() -> &'static str {
    "java"
}

fn which_java() -> Result<PathBuf, String> {
    let which = if cfg!(windows) { "where" } else { "which" };
    let output = std::process::Command::new(which)
        .arg("java")
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        let s = String::from_utf8_lossy(&output.stdout);
        let first = s.lines().next().unwrap_or("").trim();
        if !first.is_empty() {
            return Ok(PathBuf::from(first));
        }
    }
    Err(
        "Java not found. Set JAVA_HOME or use 'Download Java for servers' in the wizard."
            .to_string(),
    )
}

pub fn bundled_java_dir() -> PathBuf {
    server::java_dir()
}

pub fn bundled_java_path() -> Option<PathBuf> {
    let dir = bundled_java_dir();
    let direct = dir.join("bin").join(java_exe_name());
    if direct.is_file() {
        return Some(direct);
    }
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let exe = path.join("bin").join(java_exe_name());
                if exe.is_file() {
                    return Some(exe);
                }
            }
        }
    }
    None
}
