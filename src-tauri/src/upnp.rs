//! UPnP (IGD) port forwarding so the router maps the server port to this machine.
//! Tried first when sharing; if it fails, the app falls back to tunnel (bore).

use std::net::SocketAddr;
use std::sync::Mutex;

use igd_next::{search_gateway, PortMappingProtocol, SearchOptions};

fn friendly_upnp_discovery_error(e: impl std::fmt::Display) -> String {
    let s = e.to_string();
    if s.contains("10060")
        || s.contains("timed out")
        || s.contains("timeout")
        || s.contains("connection attempt failed")
        || s.contains("did not properly respond")
    {
        "Router didn't respond. UPnP may be disabled on your router or it may be unreachable. Use Share server for a tunnel instead.".to_string()
    } else {
        format!(
            "Could not find a UPnP router. Use Share server for a tunnel instead. ({})",
            s
        )
    }
}

/// Result of trying UPnP: external address "ip:port" on success.
pub fn try_upnp_forward(port: u16) -> Result<String, String> {
    let gateway = search_gateway(SearchOptions::default())
        .map_err(|e| friendly_upnp_discovery_error(e))?;

    let local_addr = local_socket_addr(port)?;
    let description = format!("iHostMC Minecraft {}", port);
    let lease = 0u32; // 0 = permanent on many routers

    gateway
        .add_port(
            PortMappingProtocol::TCP,
            port,
            local_addr,
            lease,
            &description,
        )
        .map_err(|e| format!("UPnP TCP: {}. Use \"Share server\" for tunnel.", e))?;
    gateway
        .add_port(
            PortMappingProtocol::UDP,
            port,
            local_addr,
            lease,
            &description,
        )
        .map_err(|e| format!("UPnP UDP: {}. TCP may still work.", e))?;

    let external_ip = gateway.get_external_ip().map_err(|e| e.to_string())?;
    Ok(format!("{}:{}", external_ip, port))
}

/// Remove UPnP port mapping for the given port. Call when server stops.
pub fn remove_upnp_forward(port: u16) -> Result<(), String> {
    let gateway = search_gateway(SearchOptions::default()).map_err(|e| e.to_string())?;
    let _ = gateway.remove_port(PortMappingProtocol::TCP, port);
    let _ = gateway.remove_port(PortMappingProtocol::UDP, port);
    Ok(())
}

fn local_socket_addr(port: u16) -> Result<SocketAddr, String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(std::time::Duration::from_secs(1)))
        .ok();
    socket
        .set_write_timeout(Some(std::time::Duration::from_secs(1)))
        .ok();
    if socket.connect("8.8.8.8:80").is_err() {
        return Ok(SocketAddr::from(([0, 0, 0, 0], port)));
    }
    let local = socket.local_addr().map_err(|e| e.to_string())?;
    Ok(SocketAddr::new(local.ip(), port))
}

/// Tracks whether we added UPnP for a port so we can remove it on stop.
static UPNP_PORT: Mutex<Option<u16>> = Mutex::new(None);

pub fn set_upnp_port(port: u16) {
    *UPNP_PORT.lock().unwrap() = Some(port);
}

pub fn clear_upnp_port() -> Option<u16> {
    UPNP_PORT.lock().unwrap().take()
}

pub fn remove_upnp_if_active() {
    if let Some(port) = clear_upnp_port() {
        let _ = remove_upnp_forward(port);
    }
}
