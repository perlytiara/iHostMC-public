// Show console for debugging startup - remove for production
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("{}", info);
        eprintln!("PANIC: {}", msg);
        if let Some(loc) = info.location() {
            eprintln!("  at {}:{}:{}", loc.file(), loc.line(), loc.column());
        }
        if let Ok(log_dir) = std::env::var("LOCALAPPDATA") {
            let log_path = std::path::Path::new(&log_dir).join("ihostmc-crash.log");
            let _ = std::fs::write(
                &log_path,
                format!("iHostMC crash:\n{}\nat {:?}", msg, info.location()),
            );
            eprintln!("Crash log: {}", log_path.display());
        }
    }));

    eprintln!("iHostMC starting...");
    ihostmc_lib::run();
    eprintln!("iHostMC exited");
}
