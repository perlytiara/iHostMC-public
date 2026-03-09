//! Minecraft Server List Ping (SLP) - query remote server for version, players, MOTD.
//! Protocol: https://wiki.vg/Server_List_Ping
//! Error strings are i18n keys (import.error.*) for frontend translation.

use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use std::time::Duration;

const DEFAULT_PORT: u16 = 25565;
const PROTOCOL_VERSION: i32 = 47; // 1.8.x for broad compatibility
const TIMEOUT: Duration = Duration::from_secs(5);

/// Error codes returned to frontend; use import.error.<code> for translation.
const E_TIMEOUT_CONNECTION: &str = "timeoutConnection";
const E_CONNECTION_FAILED: &str = "connectionFailed";
const E_READ_FAILED: &str = "readFailed";
const E_TIMEOUT_RESPONSE: &str = "timeoutResponse";
const E_INVALID_RESPONSE: &str = "invalidResponse";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPingResult {
    pub version_name: String,
    pub protocol_version: i32,
    pub players_online: i32,
    pub players_max: i32,
    pub description: String,
    pub favicon_b64: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlpResponse {
    version: SlpVersion,
    players: SlpPlayers,
    description: serde_json::Value,
    #[serde(default)]
    favicon: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlpVersion {
    name: String,
    protocol: i32,
}

#[derive(Debug, Deserialize)]
struct SlpPlayers {
    max: i32,
    online: i32,
}

fn extract_description_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => return s.clone(),
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(t)) = map.get("text") {
                let mut out = t.clone();
                if let Some(serde_json::Value::Array(extra)) = map.get("extra") {
                    for part in extra {
                        if let Some(serde_json::Value::String(t)) = part.get("text") {
                            out.push_str(t);
                        }
                    }
                }
                return out;
            }
            if let Some(serde_json::Value::Array(extra)) = map.get("extra") {
                let mut out = String::new();
                for part in extra {
                    if let Some(serde_json::Value::String(t)) = part.get("text") {
                        out.push_str(t);
                    }
                }
                return out;
            }
        }
        _ => {}
    }
    String::new()
}

fn write_varint(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut byte = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn read_varint<R: Read>(r: &mut R) -> std::io::Result<i32> {
    let mut result = 0i32;
    let mut shift = 0;
    loop {
        let mut buf = [0u8; 1];
        r.read_exact(&mut buf)?;
        let byte = buf[0] as i32;
        result |= (byte & 0x7F) << shift;
        if (byte & 0x80) == 0 {
            break;
        }
        shift += 7;
        if shift >= 35 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "VarInt too long",
            ));
        }
    }
    Ok(result)
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    write_varint(buf, bytes.len() as i32);
    buf.extend_from_slice(bytes);
}

fn read_string<R: Read>(r: &mut R) -> std::io::Result<String> {
    let len = read_varint(r)? as usize;
    if len > 65536 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "String too long",
        ));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    String::from_utf8(buf)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid UTF-8"))
}

fn strip_minecraft_formatting(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next(); // skip formatting code
            continue;
        }
        out.push(c);
    }
    out
}

pub async fn ping_server(host: &str, port: Option<u16>) -> Result<ServerPingResult, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    let addr = format!("{}:{}", host, port);

    let stream = tokio::time::timeout(TIMEOUT, tokio::net::TcpStream::connect(&addr))
        .await
        .map_err(|_| E_TIMEOUT_CONNECTION.to_string())?
        .map_err(|_| E_CONNECTION_FAILED.to_string())?;

    // Handshake: packet id 0x00, protocol, host, port, state 1
    let mut handshake = Vec::new();
    write_varint(&mut handshake, PROTOCOL_VERSION);
    write_string(&mut handshake, host);
    handshake
        .write_all(&(port as u16).to_be_bytes())
        .map_err(|_| E_CONNECTION_FAILED.to_string())?;
    write_varint(&mut handshake, 1); // status state

    let mut packet = Vec::new();
    write_varint(&mut packet, handshake.len() as i32 + 1); // +1 for packet id
    write_varint(&mut packet, 0); // packet id
    packet.extend(handshake);

    let read_ping = async move {
        let mut stream = stream;
        tokio::io::AsyncWriteExt::write_all(&mut stream, &packet)
            .await
            .map_err(|_| E_CONNECTION_FAILED.to_string())?;

        // Status request: packet id 0x00, no payload
        let mut request = Vec::new();
        write_varint(&mut request, 1); // length
        write_varint(&mut request, 0); // packet id
        tokio::io::AsyncWriteExt::write_all(&mut stream, &request)
            .await
            .map_err(|_| E_CONNECTION_FAILED.to_string())?;

        // Read until server closes (many servers close after sending response; read_to_end handles early EOF)
        let (mut reader, _) = stream.into_split();
        let mut buf = Vec::with_capacity(8192);
        tokio::io::AsyncReadExt::read_to_end(&mut reader, &mut buf)
            .await
            .map_err(|_| E_READ_FAILED.to_string())?;

        if buf.is_empty() {
            return Err(E_READ_FAILED.to_string());
        }

        let mut cursor = Cursor::new(&buf);
        let len = read_varint(&mut cursor).map_err(|_| E_INVALID_RESPONSE.to_string())?;
        if len <= 0 || len >= 1_000_000 {
            return Err(E_INVALID_RESPONSE.to_string());
        }
        let pos = cursor.position() as usize;
        if buf.len() < pos + len as usize {
            return Err(E_READ_FAILED.to_string());
        }
        let payload = &buf[pos..pos + len as usize];
        let mut payload_cursor = Cursor::new(payload);
        let _packet_id =
            read_varint(&mut payload_cursor).map_err(|_| E_INVALID_RESPONSE.to_string())?;
        let json_str =
            read_string(&mut payload_cursor).map_err(|_| E_INVALID_RESPONSE.to_string())?;
        let resp: SlpResponse =
            serde_json::from_str(&json_str).map_err(|_| E_INVALID_RESPONSE.to_string())?;

        let description = strip_minecraft_formatting(&extract_description_text(&resp.description));
        let favicon = resp.favicon.map(|s| {
            s.strip_prefix("data:image/png;base64,")
                .unwrap_or(&s)
                .to_string()
        });
        Ok(ServerPingResult {
            version_name: resp.version.name,
            protocol_version: resp.version.protocol,
            players_online: resp.players.online,
            players_max: resp.players.max,
            description: description.trim().to_string(),
            favicon_b64: favicon,
        })
    };

    match tokio::time::timeout(TIMEOUT, read_ping).await {
        Ok(inner) => inner,
        Err(_) => Err(E_TIMEOUT_RESPONSE.to_string()),
    }
}
