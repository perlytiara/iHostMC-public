//! Sort Minecraft-style version strings (e.g. 1.21.1, 1.20.4) newest first.

fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let segments_a: Vec<&str> = a.split('.').collect();
    let segments_b: Vec<&str> = b.split('.').collect();
    let max_len = segments_a.len().max(segments_b.len());
    for i in 0..max_len {
        let na = segments_a
            .get(i)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let nb = segments_b
            .get(i)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        match na.cmp(&nb) {
            std::cmp::Ordering::Equal => continue,
            o => return o,
        }
    }
    std::cmp::Ordering::Equal
}

/// Sorts version strings in place, newest first (e.g. 1.21.1 before 1.20.4).
pub fn sort_versions_newest_first(versions: &mut [String]) {
    versions.sort_by(|a, b| version_cmp(b, a));
}
