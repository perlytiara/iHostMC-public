@echo off
REM Ensure Cargo/Rust are on PATH (e.g. after fresh install or in new terminal)
set "CARGO_BIN=%USERPROFILE%\.cargo\bin"
if exist "%CARGO_BIN%\cargo.exe" set "PATH=%CARGO_BIN%;%PATH%"
npm run tauri dev
