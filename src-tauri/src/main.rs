#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {info}");
        if !ihostmc_lib::write_crash_log(&msg) {
            eprintln!("{msg}");
        }
    }));
    ihostmc_lib::run()
}
