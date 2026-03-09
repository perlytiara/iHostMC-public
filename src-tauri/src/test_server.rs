//! Test server: when IHOSTMC_TEST=1, run a small HTTP server so a browser or test runner
//! can invoke app commands and read results (like Cursor's browser automation for the app).

use crate::commands::{self, CreateServerInput};
use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use tauri::AppHandle;
use tower_http::cors::{Any, CorsLayer};

pub const TEST_PORT: u16 = 1422;

pub fn test_control_url() -> String {
    format!("http://localhost:{}/", TEST_PORT)
}

#[derive(Clone)]
struct TestState {
    app: AppHandle,
}

#[derive(Deserialize)]
struct InvokeRequest {
    cmd: String,
    #[serde(default)]
    args: serde_json::Value,
}

async fn control_ui() -> Html<&'static str> {
    Html(include_str!("../test_control.html"))
}

async fn invoke_handler(
    State(state): State<TestState>,
    Json(req): Json<InvokeRequest>,
) -> impl IntoResponse {
    let result = dispatch_invoke(&state.app, &req.cmd, &req.args).await;
    match result {
        Ok(value) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "data": value })),
        ),
        Err(e) => (
            StatusCode::OK,
            Json(serde_json::json!({ "ok": false, "error": e })),
        ),
    }
}

async fn dispatch_invoke(
    app: &AppHandle,
    cmd: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let obj = args.as_object();
    let get_str_opt = |key: &str| {
        obj.and_then(|o| o.get(key))
            .and_then(|v| v.as_str())
            .map(String::from)
    };
    let req = |key: &str, msg: &str| get_str_opt(key).ok_or_else(|| msg.to_string());
    let get_u32 = |key: &str| {
        obj.and_then(|o| o.get(key))
            .and_then(|v| v.as_u64())
            .map(|u| u as u32)
    };
    let get_array = |key: &str| {
        obj.and_then(|o| o.get(key))
            .and_then(|v| v.as_array())
            .cloned()
    };

    match cmd {
        "list_servers" => {
            Ok(serde_json::to_value(commands::list_servers()).map_err(|e| e.to_string())?)
        }
        "get_server_status" => {
            Ok(serde_json::to_value(commands::get_server_status()).map_err(|e| e.to_string())?)
        }
        "get_running_server_id" => {
            Ok(serde_json::to_value(commands::get_running_server_id())
                .map_err(|e| e.to_string())?)
        }
        "get_system_ram_mb" => {
            let r = commands::get_system_ram_mb().map_err(|e| e.to_string())?;
            Ok(serde_json::json!(r))
        }
        "get_java_paths" => {
            let r = commands::get_java_paths().map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_vanilla" => {
            let r = commands::get_versions_vanilla()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_paper" => {
            let r = commands::get_versions_paper()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_purpur" => {
            let r = commands::get_versions_purpur()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_fabric" => {
            let r = commands::get_versions_fabric()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_fabric_loader" => {
            let r = commands::get_versions_fabric_loader()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_fabric_installer" => {
            let r = commands::get_versions_fabric_installer()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_fabric_loader_for_game" => {
            let g = req("gameVersion", "missing gameVersion")?;
            let r = commands::get_versions_fabric_loader_for_game(g)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_spigot" => {
            let r = commands::get_versions_spigot()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_bukkit" => {
            let r = commands::get_versions_bukkit()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_forge" => {
            let r = commands::get_versions_forge()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_forge_builds" => {
            let mv = req("minecraftVersion", "missing minecraftVersion")?;
            let r = commands::get_versions_forge_builds(mv)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_neoforge" => {
            let r = commands::get_versions_neoforge()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_neoforge_for_game" => {
            let mv = req("minecraftVersion", "missing minecraftVersion")?;
            let r = commands::get_versions_neoforge_for_game(mv)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_quilt" => {
            let r = commands::get_versions_quilt()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_versions_quilt_loader" => {
            let r = commands::get_versions_quilt_loader()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "get_quilt_installer_url" => {
            let g = req("gameVersion", "missing gameVersion")?;
            let l = req("loaderVersion", "missing loaderVersion")?;
            let r = commands::get_quilt_installer_url(g, l);
            Ok(serde_json::to_value(r).expect("Option<String> serializes"))
        }
        "delete_server" => {
            let id = req("id", "missing id")?;
            commands::delete_server(id).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(null))
        }
        "stop_server" => {
            let r = commands::stop_server().map_err(|e| e.to_string())?;
            Ok(serde_json::json!(r))
        }
        "send_server_input" => {
            let input = req("input", "missing input")?;
            commands::send_server_input(input).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(null))
        }
        "start_server" => {
            let id = req("id", "missing id")?;
            commands::start_server(app.clone(), id, None)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::json!(null))
        }
        "create_server" => {
            let config: CreateServerInput =
                serde_json::from_value(args.clone()).map_err(|e| e.to_string())?;
            let r = commands::create_server(app.clone(), config)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "list_server_files" => {
            let server_id = req("serverId", "missing serverId")?;
            let subpath = get_str_opt("subpath");
            let r = commands::list_server_files(server_id, subpath).map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "scan_server_files_for_backup" => {
            let server_id = req("serverId", "missing serverId")?;
            let r = commands::scan_server_files_for_backup(server_id).map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "read_server_file" => {
            let server_id = req("serverId", "missing serverId")?;
            let path = req("path", "missing path")?;
            let r = commands::read_server_file(server_id, path).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(r))
        }
        "write_server_file" => {
            let server_id = req("serverId", "missing serverId")?;
            let path = req("path", "missing path")?;
            let content = get_str_opt("content").unwrap_or_default();
            commands::write_server_file(server_id, path, content).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(null))
        }
        "open_server_folder" => {
            let server_id = req("serverId", "missing serverId")?;
            commands::open_server_folder(server_id).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(null))
        }
        "rename_server" => {
            let id = req("id", "missing id")?;
            let new_name = req("newName", "missing newName")?;
            commands::rename_server(id, new_name).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(null))
        }
        "search_modrinth_mods" => {
            let query = req("query", "missing query")?;
            let game_version = get_str_opt("gameVersion");
            let loaders: Option<Vec<String>> = get_array("loaders").map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            });
            let limit = get_u32("limit");
            let r = commands::search_modrinth_mods(query, game_version, loaders, limit)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "search_modrinth_plugins" => {
            let query = req("query", "missing query")?;
            let game_version = get_str_opt("gameVersion");
            let limit = get_u32("limit");
            let r = commands::search_modrinth_plugins(query, game_version, limit)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        "search_spiget_plugins" => {
            let query = req("query", "missing query")?;
            let size = get_u32("size");
            let r = commands::search_spiget_plugins(query, size)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(r).map_err(|e| e.to_string())?)
        }
        _ => Err(format!("unknown command: {}", cmd)),
    }
}

pub fn should_run() -> bool {
    std::env::var("IHOSTMC_TEST").as_deref() == Ok("1")
}

pub async fn run(app: AppHandle) {
    let state = TestState { app: app.clone() };
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let app_router = Router::new()
        .route("/", get(control_ui))
        .route("/invoke", post(invoke_handler))
        .layer(cors)
        .with_state(state);

    let addr = (std::net::Ipv4Addr::LOCALHOST, TEST_PORT);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("test server bind");
    eprintln!(
        "[iHostMC] Test server: http://localhost:{}/ (invoke commands from browser)",
        TEST_PORT
    );
    axum::serve(listener, app_router)
        .await
        .expect("test server serve");
}
