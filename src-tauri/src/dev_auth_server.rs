//! Local HTTP server on localhost:1421 so the website can send auth to the app.
//! Two flows:
//! 1) App-initiated (session): POST /create-session -> session_id; user goes to website/login?session=ID;
//!    after login website POSTs /register-session { session_id, payload }, redirects to /accept?session=ID.
//! 2) Website-initiated (handoff): POST /register { token, payload }, redirect to /accept?token=XXX.
//! Works in dev and release.

use base64::Engine;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

pub const DEV_AUTH_PORT: u16 = 1421;
const PENDING_EXPIRY_SECS: i64 = 300;

#[derive(Deserialize)]
struct AuthPostBody {
    payload: String,
}

#[derive(Deserialize)]
struct RegisterBody {
    token: String,
    payload: String,
}

#[derive(Deserialize)]
struct RegisterSessionBody {
    session_id: String,
    payload: String,
}

#[derive(Serialize)]
struct CreateSessionResponse {
    session_id: String,
}

#[derive(Deserialize)]
struct AuthPayload {
    token: String,
    #[serde(rename = "userId")]
    user_id: String,
    email: String,
    exp: i64,
}

#[derive(Clone)]
struct DevAuthState {
    app: AppHandle,
    pending: Arc<RwLock<HashMap<String, (String, i64)>>>,
}

fn decode_and_emit(state: &DevAuthState, payload_b64: &str) -> Result<(), String> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(payload_b64.trim())
        .map_err(|_| "invalid base64")?;
    let json_str = String::from_utf8(decoded).map_err(|_| "invalid utf-8")?;
    let payload: AuthPayload = serde_json::from_str(&json_str).map_err(|_| "invalid payload")?;
    if payload.token.is_empty() || payload.user_id.is_empty() || payload.email.is_empty() {
        return Err("missing fields".into());
    }
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if now_secs > payload.exp {
        return Err("expired".into());
    }
    let emit_payload = serde_json::json!({
        "token": payload.token,
        "userId": payload.user_id,
        "email": payload.email,
    });
    let _ = state.app.emit("deep-link-auth", emit_payload);
    Ok(())
}

async fn auth_handler(
    State(state): State<DevAuthState>,
    Json(body): Json<AuthPostBody>,
) -> impl IntoResponse {
    if body.payload.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "missing payload");
    }
    match decode_and_emit(&state, &body.payload) {
        Ok(()) => (StatusCode::OK, "ok"),
        Err(_) => (StatusCode::BAD_REQUEST, "invalid payload"),
    }
}

#[derive(Deserialize)]
struct AcceptQuery {
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    session: Option<String>,
}

async fn register_handler(
    State(state): State<DevAuthState>,
    Json(body): Json<RegisterBody>,
) -> impl IntoResponse {
    let token = body.token.trim().to_string();
    let payload = body.payload.trim().to_string();
    if token.is_empty() || payload.is_empty() {
        return (StatusCode::BAD_REQUEST, "missing token or payload");
    }
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let expiry = now_secs + PENDING_EXPIRY_SECS;
    state.pending.write().await.insert(token, (payload.clone(), expiry));
    // Emit auth immediately so the app signs in without the browser visiting /accept
    let _ = decode_and_emit(&state, &payload);
    (StatusCode::OK, "ok")
}

async fn create_session_handler(State(state): State<DevAuthState>) -> impl IntoResponse {
    let session_id = uuid::Uuid::new_v4().to_string().replace('-', "").chars().take(16).collect::<String>();
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    state.pending.write().await.insert(session_id.clone(), (String::new(), now_secs + PENDING_EXPIRY_SECS));
    (StatusCode::OK, Json(CreateSessionResponse { session_id }))
}

async fn register_session_handler(
    State(state): State<DevAuthState>,
    Json(body): Json<RegisterSessionBody>,
) -> impl IntoResponse {
    let session_id = body.session_id.trim().to_string();
    let payload = body.payload.trim().to_string();
    if session_id.is_empty() || payload.is_empty() {
        return (StatusCode::BAD_REQUEST, "missing session_id or payload");
    }
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let expiry = now_secs + PENDING_EXPIRY_SECS;
    let mut map = state.pending.write().await;
    if map.get(&session_id).is_none() {
        return (StatusCode::NOT_FOUND, "invalid or expired session");
    }
    map.insert(session_id.clone(), (payload.clone(), expiry));
    drop(map);
    // Emit auth immediately so the app signs in without the browser visiting /accept
    let _ = decode_and_emit(&state, &payload);
    (StatusCode::OK, "ok")
}

async fn accept_handler(
    State(state): State<DevAuthState>,
    Query(q): Query<AcceptQuery>,
) -> impl IntoResponse {
    let key = q.token.or(q.session).unwrap_or_default().trim().to_string();
    if key.is_empty() {
        return (StatusCode::BAD_REQUEST, Html(ACCEPT_HTML.replace("{{msg}}", "Missing token or session. Use the link from the app or dashboard.")));
    }
    let payload_b64 = {
        let mut map = state.pending.write().await;
        let now_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let entry = map.remove(&key);
        if let Some((p, exp)) = entry {
            if p.is_empty() {
                return (StatusCode::BAD_REQUEST, Html(ACCEPT_HTML.replace("{{msg}}", "Complete sign-in on the website first, then you will be redirected here.")));
            }
            if now_secs > exp {
                return (StatusCode::GONE, Html(ACCEPT_HTML.replace("{{msg}}", "Link expired. Sign in again on the website.")));
            }
            p
        } else {
            return (StatusCode::NOT_FOUND, Html(ACCEPT_HTML.replace("{{msg}}", "Invalid or already used link. Sign in again on the website.")));
        }
    };
    match decode_and_emit(&state, &payload_b64) {
        Ok(()) => (StatusCode::OK, Html(ACCEPT_HTML.replace("{{msg}}", "Signed in! Close this tab. If the iHostMC window didn't open, open it from your taskbar or Start menu."))),
        Err(_) => (StatusCode::BAD_REQUEST, Html(ACCEPT_HTML.replace("{{msg}}", "Invalid payload. Sign in again on the website."))),
    }
}

const ACCEPT_HTML: &str = r#"<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>iHostMC</title><style>body{font-family:system-ui,sans-serif;background:#1a1a1a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:1rem;}p{font-size:1.1rem;}</style></head><body><p>{{msg}}</p><p style="font-size:0.75rem;color:#737373;margin-top:1rem;">This page is HTTP on purpose (localhost). If a browser extension blocks it, allow HTTP for 127.0.0.1.</p></body></html>"#;

pub async fn run(app: AppHandle) {
    let state = DevAuthState {
        app,
        pending: Arc::new(RwLock::new(HashMap::new())),
    };
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::OPTIONS])
        .allow_headers([axum::http::header::CONTENT_TYPE]);
    async fn favicon_handler() -> impl IntoResponse {
        (StatusCode::NO_CONTENT, ())
    }

    let app_router = Router::new()
        .route("/favicon.ico", get(favicon_handler))
        .route("/auth", post(auth_handler))
        .route("/register", post(register_handler))
        .route("/create-session", post(create_session_handler))
        .route("/register-session", post(register_session_handler))
        .route("/accept", get(accept_handler))
        .layer(cors)
        .with_state(state);
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], DEV_AUTH_PORT));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[dev] auth server bind {}: {}", addr, e);
            return;
        }
    };
    let _ = axum::serve(listener, app_router).await;
}
