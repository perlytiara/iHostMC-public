use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

static RUNNING: AtomicBool = AtomicBool::new(false);
static RUNNING_SERVER_ID: Mutex<Option<String>> = Mutex::new(None);
static CHILD: Mutex<Option<Child>> = Mutex::new(None);
static SERVER_START_TIME: Mutex<Option<Instant>> = Mutex::new(None);

/// Call when starting the server, before set_running_server_id(Some(id)).
pub fn set_server_start_time() {
    *SERVER_START_TIME.lock().unwrap() = Some(Instant::now());
}

/// Uptime in seconds since server start, or None if not running.
pub fn server_uptime_secs() -> Option<u64> {
    SERVER_START_TIME
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_secs())
}

/// Set which server id is currently running (called from commands when start/stop).
pub fn set_running_server_id(id: Option<String>) {
    if id.is_none() {
        *SERVER_START_TIME.lock().unwrap() = None;
    }
    *RUNNING_SERVER_ID.lock().unwrap() = id;
}

/// Id of the server currently running, if any.
pub fn running_server_id() -> Option<String> {
    RUNNING_SERVER_ID.lock().unwrap().clone()
}

fn spawn_with_pipes(
    mut child: Child,
    emit_output: Arc<dyn Fn(String) + Send + Sync>,
    on_exit: Option<Arc<dyn Fn() + Send + Sync>>,
) -> Result<(), String> {
    let stdout = child.stdout.take().ok_or("stdout")?;
    let stderr = child.stderr.take().ok_or("stderr")?;
    let emit_stdout = Arc::clone(&emit_output);
    let emit_stderr = Arc::clone(&emit_output);
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = [0u8; 4096];
        let mut stdout = stdout;
        loop {
            match stdout.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let line = String::from_utf8_lossy(&buf[..n]).to_string();
                    emit_stdout(line);
                }
                Err(_) => break,
            }
        }
    });
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = [0u8; 4096];
        let mut stderr = stderr;
        loop {
            match stderr.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let line = String::from_utf8_lossy(&buf[..n]).to_string();
                    emit_stderr(line);
                }
                Err(_) => break,
            }
        }
    });
    RUNNING.store(true, Ordering::SeqCst);
    *CHILD.lock().unwrap() = Some(child);

    if let Some(exit_cb) = on_exit {
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let mut guard = CHILD.lock().unwrap();
            match guard.as_mut() {
                Some(child) => match child.try_wait() {
                    Ok(Some(_)) => {
                        *guard = None;
                        drop(guard);
                        RUNNING.store(false, Ordering::SeqCst);
                        set_running_server_id(None);
                        exit_cb();
                        break;
                    }
                    Ok(None) => {}
                    Err(_) => {
                        *guard = None;
                        drop(guard);
                        RUNNING.store(false, Ordering::SeqCst);
                        set_running_server_id(None);
                        exit_cb();
                        break;
                    }
                },
                None => break,
            }
        });
    }

    Ok(())
}

pub fn start_java_server(
    java_path: &str,
    jar_path: &str,
    memory_mb: u32,
    emit_output: Arc<dyn Fn(String) + Send + Sync>,
    on_exit: Option<Arc<dyn Fn() + Send + Sync>>,
) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("A server is already running".to_string());
    }
    let cwd = std::path::Path::new(jar_path)
        .parent()
        .ok_or("Invalid jar path")?
        .to_path_buf();
    let child = Command::new(java_path)
        .arg(format!("-Xmx{}M", memory_mb))
        .arg("-Duser.language=en")
        .arg("-Duser.country=US")
        .arg("-jar")
        .arg(jar_path)
        .arg("nogui")
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    spawn_with_pipes(child, emit_output, on_exit)
}

/// Start Java server detached so it keeps running when the app is closed.
/// Output is appended to server.log in the server directory.
pub fn start_java_server_detached(
    java_path: &str,
    jar_path: &str,
    memory_mb: u32,
) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("A server is already running".to_string());
    }
    let cwd = std::path::Path::new(jar_path)
        .parent()
        .ok_or("Invalid jar path")?
        .to_path_buf();
    let log_path = cwd.join("server.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    let log_file2 = log_file.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(java_path);
    cmd.arg(format!("-Xmx{}M", memory_mb))
        .arg("-Duser.language=en")
        .arg("-Duser.country=US")
        .arg("-jar")
        .arg(jar_path)
        .arg("nogui")
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file2));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }

    cmd.spawn().map_err(|e| e.to_string())?;
    RUNNING.store(true, Ordering::SeqCst);
    Ok(())
}

/// Start server by running run.bat (Windows) or run.sh (Unix) in the given directory (Forge/NeoForge).
pub fn start_run_script(
    working_dir: &Path,
    emit_output: Arc<dyn Fn(String) + Send + Sync>,
    on_exit: Option<Arc<dyn Fn() + Send + Sync>>,
) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("A server is already running".to_string());
    }
    let run_script = working_dir.join(if cfg!(windows) { "run.bat" } else { "run.sh" });
    if !run_script.exists() {
        return Err(format!(
            "Run script not found: {}. Install the server first.",
            run_script.display()
        ));
    }
    let java_locale_env = "-Duser.language=en -Duser.country=US";
    let child = if cfg!(windows) {
        Command::new("cmd")
            .args(["/c", run_script.to_str().unwrap_or("run.bat")])
            .current_dir(working_dir)
            .env("JAVA_TOOL_OPTIONS", java_locale_env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
    } else {
        Command::new("sh")
            .arg(run_script.to_str().unwrap_or("run.sh"))
            .current_dir(working_dir)
            .env("JAVA_TOOL_OPTIONS", java_locale_env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
    };
    spawn_with_pipes(child, emit_output, on_exit)
}

/// Start Forge/NeoForge server detached (run script). Output to server.log.
pub fn start_run_script_detached(working_dir: &Path) -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Err("A server is already running".to_string());
    }
    let run_script = working_dir.join(if cfg!(windows) { "run.bat" } else { "run.sh" });
    if !run_script.exists() {
        return Err(format!(
            "Run script not found: {}. Install the server first.",
            run_script.display()
        ));
    }
    let log_path = working_dir.join("server.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    let log_file2 = log_file.try_clone().map_err(|e| e.to_string())?;
    let java_locale_env = "-Duser.language=en -Duser.country=US";

    let mut cmd: Command = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/c", run_script.to_str().unwrap_or("run.bat")])
            .current_dir(working_dir)
            .env("JAVA_TOOL_OPTIONS", java_locale_env)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_file2));
        c
    } else {
        let mut c = Command::new("sh");
        c.arg(run_script.to_str().unwrap_or("run.sh"))
            .current_dir(working_dir)
            .env("JAVA_TOOL_OPTIONS", java_locale_env)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_file2));
        c
    };

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }

    cmd.spawn().map_err(|e| e.to_string())?;
    RUNNING.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn stop_server() -> bool {
    if !RUNNING.load(Ordering::SeqCst) {
        return false;
    }
    let mut guard = CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;
    drop(guard);

    // For detached servers (CHILD is None), kill by server directory
    if let Some(ref id) = running_server_id() {
        if let Some(config) = crate::server::get_server(id) {
            kill_java_processes_in_dir(&config.path);
            kill_process_on_port(config.port);
        }
    }

    RUNNING.store(false, Ordering::SeqCst);
    set_running_server_id(None);
    true
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Kill any Java processes whose command line references the given directory.
/// Returns the number of processes killed.
pub fn kill_java_processes_in_dir(dir: &Path) -> usize {
    use sysinfo::{Signal, System};

    let dir_str = dir.to_string_lossy().to_lowercase().replace('\\', "/");

    let mut sys = System::new();
    sys.refresh_processes();

    let mut killed = 0;
    for (_pid, proc_) in sys.processes() {
        let name = proc_.name().to_lowercase();
        if name != "java" && name != "java.exe" && name != "javaw.exe" {
            continue;
        }
        let cmd_joined = proc_.cmd().join(" ").to_lowercase().replace('\\', "/");
        if cmd_joined.contains(&dir_str) {
            if proc_.kill_with(Signal::Kill).unwrap_or(false) {
                proc_.wait();
                killed += 1;
            }
        }
    }
    killed
}

/// Returns true if something is listening on the given TCP port. Does not bind to the port.
#[cfg(windows)]
pub fn port_is_listening(port: u16) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let port_suffix = format!(":{}", port);
    let output = match Command::new("cmd")
        .args(["/c", "netstat -ano -p tcp"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    {
        Ok(o) => o,
        Err(_) => return false,
    };
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            continue;
        }
        let local_addr = parts[1];
        if local_addr.ends_with(&port_suffix) && parts[3] == "LISTENING" {
            return true;
        }
    }
    false
}

#[cfg(not(windows))]
pub fn port_is_listening(port: u16) -> bool {
    let port_str = port.to_string();
    let script = format!(
        "ss -tln 2>/dev/null | grep -q ':{} ' || netstat -tln 2>/dev/null | grep -q ':{} '",
        port_str, port_str
    );
    Command::new("sh")
        .args(["-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Kill Java processes listening on the given TCP port.
/// Only kills java/javaw processes, never other applications.
/// Fallback for detached processes where sysinfo can't read the command line.
pub fn kill_process_on_port(port: u16) -> usize {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let port_suffix = format!(":{}", port);
        let output = match Command::new("cmd")
            .args(["/c", "netstat -ano -p tcp"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
        {
            Ok(o) => o,
            Err(_) => return 0,
        };

        let text = String::from_utf8_lossy(&output.stdout);
        let mut killed = 0;
        for line in text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 {
                continue;
            }
            let local_addr = parts[1];
            if !local_addr.ends_with(&port_suffix) {
                continue;
            }
            if parts[3] != "LISTENING" {
                continue;
            }
            if let Ok(pid) = parts[4].parse::<u32>() {
                if pid == 0 {
                    continue;
                }
                // Only kill Java processes, not random apps
                if !is_java_pid(pid) {
                    continue;
                }
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .output();
                killed += 1;
            }
        }
        killed
    }
    #[cfg(not(windows))]
    {
        let output = match Command::new("lsof")
            .args(["-ti", &format!("tcp:{}", port)])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
        {
            Ok(o) => o,
            Err(_) => return 0,
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut killed = 0;
        for line in text.lines() {
            if let Ok(pid) = line.trim().parse::<i32>() {
                if pid > 0 && is_java_pid(pid as u32) {
                    let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                    killed += 1;
                }
            }
        }
        killed
    }
}

/// Check if a PID belongs to a Java process.
fn is_java_pid(pid: u32) -> bool {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes();
    if let Some(proc_) = sys.process(sysinfo::Pid::from(pid as usize)) {
        let name = proc_.name().to_lowercase();
        return name == "java" || name == "java.exe" || name == "javaw.exe";
    }
    false
}

pub fn write_stdin(data: &[u8]) -> Result<(), String> {
    let mut guard = CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        if let Some(ref mut stdin) = child.stdin {
            use std::io::Write;
            stdin.write_all(data).map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("No running server".to_string())
}

/// Tail a log file and stream its content via the emit callback.
/// Runs in a background thread until RUNNING becomes false.
pub fn tail_server_log(
    log_path: &Path,
    emit_output: Arc<dyn Fn(String) + Send + Sync>,
    on_exit: Option<Arc<dyn Fn() + Send + Sync>>,
) {
    let path = log_path.to_path_buf();
    std::thread::spawn(move || {
        use std::io::Read;

        let mut file = loop {
            if !RUNNING.load(Ordering::SeqCst) {
                return;
            }
            match std::fs::File::open(&path) {
                Ok(f) => break f,
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
            }
        };

        let mut buf = [0u8; 4096];
        let mut idle_count: u32 = 0;
        loop {
            if !RUNNING.load(Ordering::SeqCst) {
                break;
            }
            match file.read(&mut buf) {
                Ok(0) => {
                    idle_count += 1;
                    // After ~30s of no output, check if the Java process is gone
                    if idle_count > 200 {
                        idle_count = 0;
                        if !is_java_process_alive_in_dir(&path) {
                            RUNNING.store(false, Ordering::SeqCst);
                            set_running_server_id(None);
                            if let Some(ref cb) = on_exit {
                                cb();
                            }
                            break;
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
                Ok(n) => {
                    idle_count = 0;
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    emit_output(chunk);
                }
                Err(_) => break,
            }
        }
    });
}

fn is_java_process_alive_in_dir(log_path: &Path) -> bool {
    use sysinfo::System;
    let dir = match log_path.parent() {
        Some(d) => d,
        None => return false,
    };
    let dir_str = dir.to_string_lossy().to_lowercase().replace('\\', "/");
    let mut sys = System::new_all();
    sys.refresh_processes();
    for (_pid, proc_) in sys.processes() {
        let name = proc_.name().to_lowercase();
        if name != "java" && name != "java.exe" && name != "javaw.exe" {
            continue;
        }
        let cmd_fwd = proc_.cmd().join(" ").to_lowercase().replace('\\', "/");
        if cmd_fwd.contains(&dir_str) {
            return true;
        }
    }
    false
}

/// Returns (memory_mb, cpu_percent) for the Java process in the given server directory, if found.
pub fn get_server_process_stats(server_dir: &Path) -> Option<(u64, f32)> {
    use sysinfo::System;
    let dir_str = server_dir
        .to_string_lossy()
        .to_lowercase()
        .replace('\\', "/");
    let mut sys = System::new_all();
    sys.refresh_processes();
    // Refresh again after short interval for more accurate CPU usage
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_processes();
    for (_pid, proc_) in sys.processes() {
        let name = proc_.name().to_lowercase();
        if name != "java" && name != "java.exe" && name != "javaw.exe" {
            continue;
        }
        let cmd_fwd = proc_.cmd().join(" ").to_lowercase().replace('\\', "/");
        if cmd_fwd.contains(&dir_str) {
            let memory_mb = proc_.memory() / (1024 * 1024);
            let cpu = proc_.cpu_usage();
            return Some((memory_mb, cpu));
        }
    }
    None
}
