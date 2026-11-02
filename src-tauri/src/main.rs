#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! CampusOne Card Reader (client 2026-10-08): a small helper next to the browser. It reads and writes
//! NFC cards on a USB PC/SC reader (ACR122U or similar) with the CUG dashboard's three operations,
//! and offers them to this computer only, at http://127.0.0.1:47821, for the CampusOne web pages:
//!
//! - GET  /status → { ok, app, version, port, readers: [names], watching }
//! - GET  /card   → { seq, present, reader, uid, token, error, at }   the last card placed
//! - GET  /uid    → { uid }            the card's serial number (hex)
//! - GET  /token  → { token }          base64 of sector 1, blocks 4–6 (read_nfc_token)
//! - POST /token  { token }  → { ok }  writes those bytes (write_nfc_token)
//!
//! Client 2026-10-22: the helper watches the reader itself and reads each card **once, when it is
//! placed** (`/card`; `seq` grows with every card). Pages that take taps ask `/card` and never touch
//! the card while it lies there: reading it every second (and resetting it after each read) made
//! the ACR122U lose track of the card — its light stayed green after the card was taken off, and
//! the next card was checked against the old one's serial ("can't be used").
//!
//! Only CampusOne's own sites over https (campusone.in, uat-campusone.com, campusone.com and their subdomains)
//! and web pages from this computer or the private network (localhost, 192.168.x, 10.x,
//! 172.16–31.x) may call it; CAMPUSONE_READER_ORIGINS (comma-separated) replaces that list. The window
//! shows the reader's status and the last card. The same operations stay available as Tauri
//! commands.

use base64::engine::general_purpose;
use base64::Engine;
use pcsc::{Card, Context, Disposition, Protocols, ReaderState, Scope, ShareMode, State};
use serde_json::{json, Value};
use std::io::Read;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{command, Manager};

// ───────────────── NFC CONFIG ─────────────────

// Sector 1 blocks (Mifare Classic 1K)
const DATA_BLOCKS: [u8; 3] = [4, 5, 6];

// Custom key A (6 bytes), as in the CUG dashboard
const CUSTOM_KEY_A: [u8; 6] = *b"rcug12";

// Max capacity = 48 bytes
const MAX_TOKEN_SIZE: usize = 48;

/// The local address the web pages call.
const DEFAULT_PORT: u16 = 47821;

/// CampusOne's own sites (production, UAT), allowed over https with any subdomain.
const CAMPUSONE_DOMAINS: [&str; 3] = ["campusone.in", "uat-campusone.com", "campusone.com"];

/// A card just placed is left this long before it is read (the reader, and Windows' own look at a
/// new card, settle first).
const SETTLE_MS: u64 = 150;

/// Tries of a card operation: a failed authentication is tried again on a reset card.
const TRIES: u32 = 3;

// ───────────────── SHARED STATE ─────────────────

/// One card operation at a time: the watcher's reads and the pages' calls never meet.
static CARD_IO: Mutex<()> = Mutex::new(());

/// The last card placed on the reader, read once by the watcher (GET /card).
#[derive(Clone)]
struct Placed {
    /// Grows by one with every card placed (0: none since the helper started).
    seq: u64,
    /// A card lies on the reader now.
    present: bool,
    reader: Option<String>,
    uid: Option<String>,
    /// Base64 of sector 1, as GET /token.
    token: Option<String>,
    error: Option<String>,
    /// When it was read (ms since 1970).
    at: u64,
}

static PLACED: Mutex<Placed> = Mutex::new(Placed {
    seq: 0,
    present: false,
    reader: None,
    uid: None,
    token: None,
    error: None,
    at: 0,
});

fn placed() -> MutexGuard<'static, Placed> {
    PLACED.lock().unwrap_or_else(|e| e.into_inner())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ───────────────── STATUS CHECK ─────────────────
fn check_status(response: &[u8]) -> Result<(), String> {
    if response.len() < 2 {
        return Err("Invalid card response".into());
    }

    let sw1 = response[response.len() - 2];
    let sw2 = response[response.len() - 1];

    if sw1 == 0x90 && sw2 == 0x00 {
        Ok(())
    } else {
        Err(format!("Card returned error: {:02X} {:02X}", sw1, sw2))
    }
}

// ───────────────── AUTH WITH SPECIFIC KEY ─────────────────
fn authenticate_with_key(card: &Card, block: u8, key: &[u8; 6]) -> Result<(), String> {
    // Load key into slot 0
    let mut load_key_apdu = vec![0xFF, 0x82, 0x00, 0x00, 0x06];
    load_key_apdu.extend_from_slice(key);

    let mut resp = [0u8; 16];
    let res = card
        .transmit(&load_key_apdu, &mut resp)
        .map_err(|e| format!("Load key failed: {}", e))?;

    check_status(res)?;

    // Authenticate block using Key A
    let auth_apdu = [0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, block, 0x60, 0x00];

    let res = card
        .transmit(&auth_apdu, &mut resp)
        .map_err(|e| format!("Authentication transmit failed: {}", e))?;

    check_status(res)
}

// ───────────────── WRITE BLOCK ─────────────────
fn write_block(card: &Card, block: u8, data: &[u8; 16]) -> Result<(), String> {
    let mut apdu = vec![0xFF, 0xD6, 0x00, block, 0x10];
    apdu.extend_from_slice(data);

    let mut resp = [0u8; 16];
    let res = card
        .transmit(&apdu, &mut resp)
        .map_err(|e| format!("Write failed: {}", e))?;

    check_status(res)?;
    Ok(())
}

// ───────────────── READ BLOCK ─────────────────
fn read_block(card: &Card, block: u8) -> Result<Vec<u8>, String> {
    let apdu = [0xFF, 0xB0, 0x00, block, 0x10];
    let mut resp = [0u8; 32];

    let res = card
        .transmit(&apdu, &mut resp)
        .map_err(|e| format!("Read failed: {}", e))?;

    check_status(res)?;
    Ok(res[..res.len() - 2].to_vec())
}

// ───────────────── AUTO KEY ENSURE ─────────────────
fn ensure_custom_key(card: &mut Card) -> Result<(), String> {
    // Try custom key first
    if authenticate_with_key(card, 4, &CUSTOM_KEY_A).is_ok() {
        return Ok(());
    }

    // A failed authentication halts a MIFARE card: select it again before the default key.
    reset(card)?;

    // Try default key (ONLY for fresh cards)
    let default_key: [u8; 6] = [0xFF; 6];
    authenticate_with_key(card, 7, &default_key)?;

    // Build sector trailer: key A, access bits (transport config), key B (same as A)
    let mut trailer = [0u8; 16];
    trailer[0..6].copy_from_slice(&CUSTOM_KEY_A);
    trailer[6..10].copy_from_slice(&[0xFF, 0x07, 0x80, 0x69]);
    trailer[10..16].copy_from_slice(&CUSTOM_KEY_A);

    // Write trailer block (sector 1 trailer = block 7)
    write_block(card, 7, &trailer)?;

    // Verify custom key works
    authenticate_with_key(card, 4, &CUSTOM_KEY_A)?;
    Ok(())
}

// ───────────────── READER AND CARD ─────────────────
fn reader_names() -> Result<Vec<String>, String> {
    let ctx = Context::establish(Scope::User).map_err(|e| format!("Context error: {:?}", e))?;
    let mut readers_buf = [0u8; 2048];
    let readers = ctx
        .list_readers(&mut readers_buf)
        .map_err(|e| format!("Reader error: {:?}", e))?;
    Ok(readers
        .map(|r| r.to_string_lossy().into_owned())
        .filter(|r| !r.trim().is_empty())
        .collect())
}

fn connect() -> Result<Card, String> {
    let ctx = Context::establish(Scope::User).map_err(|e| format!("Context error: {:?}", e))?;
    let mut readers_buf = [0u8; 2048];
    let mut readers = ctx
        .list_readers(&mut readers_buf)
        .map_err(|e| format!("Reader error: {:?}", e))?;
    let reader = readers.next().ok_or("No NFC reader found")?;
    ctx.connect(reader, ShareMode::Shared, Protocols::ANY)
        .map_err(|e| format!("Connect error: {:?}", e))
}

/// Selects the card again (the reader switches its field off and on): after a failed
/// authentication a MIFARE card answers nothing until then.
fn reset(card: &mut Card) -> Result<(), String> {
    card.reconnect(ShareMode::Shared, Protocols::ANY, Disposition::ResetCard)
        .map_err(|e| format!("Connect error: {:?}", e))
}

/// Worth another try on a reset card: an authentication or read the card refused (it may still have
/// been settling on the reader), not a missing card or reader, nor an empty card.
fn retryable(e: &str) -> bool {
    e.starts_with("Card returned error")
        || e.starts_with("Authentication")
        || e.starts_with("Read failed")
        || e.starts_with("Write failed")
        || e.starts_with("Transmit error")
}

/// Runs one operation on the card on the reader, alone. A good run lets the card go as it is: a
/// reset after every read is what made the reader lose track of the card. A refused authentication
/// is tried again on a reset card; a run that failed resets the card on the way out.
fn with_card<T>(mut op: impl FnMut(&mut Card) -> Result<T, String>) -> Result<T, String> {
    let _io = CARD_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut card = connect()?;
    let mut tries = 1;
    loop {
        match op(&mut card) {
            Ok(v) => {
                if let Err((c, _)) = card.disconnect(Disposition::LeaveCard) {
                    drop(c);
                }
                return Ok(v);
            }
            Err(e) if tries < TRIES && retryable(&e) => {
                tries += 1;
                std::thread::sleep(Duration::from_millis(120));
                if reset(&mut card).is_err() {
                    card = connect()?;
                }
            }
            // Dropped: the card is reset on the way out.
            Err(e) => return Err(e),
        }
    }
}

fn uid_of(card: &mut Card) -> Result<String, String> {
    let apdu = [0xFF, 0xCA, 0x00, 0x00, 0x00];
    let mut resp = [0u8; 256];
    let response = card
        .transmit(&apdu, &mut resp)
        .map_err(|e| format!("Transmit error: {:?}", e))?;
    check_status(response)?;
    Ok(response[..response.len() - 2]
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect())
}

fn token_of(card: &mut Card) -> Result<String, String> {
    // Blocks 4–6 are one sector: one authentication opens all three.
    authenticate_with_key(card, DATA_BLOCKS[0], &CUSTOM_KEY_A)?;
    let mut collected: Vec<u8> = Vec::new();
    for block in DATA_BLOCKS {
        collected.extend_from_slice(&read_block(card, block)?);
    }

    while collected.last() == Some(&0) {
        collected.pop();
    }

    if collected.is_empty() {
        return Err("No token found in NFC tag".into());
    }

    Ok(general_purpose::STANDARD.encode(&collected))
}

fn do_read_uid() -> Result<String, String> {
    with_card(uid_of)
}

fn do_write_token(encrypted_token: &str) -> Result<String, String> {
    let token_bytes = general_purpose::STANDARD
        .decode(encrypted_token)
        .map_err(|_| "Invalid Base64 token")?;

    if token_bytes.len() > MAX_TOKEN_SIZE {
        return Err(format!(
            "Token too large ({} bytes). Max allowed is {} bytes",
            token_bytes.len(),
            MAX_TOKEN_SIZE
        ));
    }

    with_card(|card| {
        // Auto migration of a fresh card to the custom key
        ensure_custom_key(card)?;

        // Blocks 4–6 are one sector: one authentication opens all three.
        authenticate_with_key(card, DATA_BLOCKS[0], &CUSTOM_KEY_A)?;
        for (i, block) in DATA_BLOCKS.iter().enumerate() {
            let mut chunk = [0u8; 16];
            let start = i * 16;
            let end = (start + 16).min(token_bytes.len());
            if start < token_bytes.len() {
                chunk[..(end - start)].copy_from_slice(&token_bytes[start..end]);
            }

            write_block(card, *block, &chunk)?;
        }

        Ok("NFC token written successfully".to_string())
    })
}

fn do_read_token() -> Result<String, String> {
    with_card(token_of)
}

// ───────────────── WATCHING THE READER ─────────────────

/// Reads a card just placed: its serial, then its token. A card that isn't a CampusOne card (no token,
/// another system's key) keeps its serial with the error.
fn read_placed() -> Result<(String, Result<String, String>), String> {
    with_card(|card| {
        let uid = uid_of(card)?;
        match token_of(card) {
            Ok(token) => Ok((uid, Ok(token))),
            // Tried again on a reset card while tries are left; the last answer is kept below.
            Err(e) if retryable(&e) => Err(e),
            Err(e) => Ok((uid, Err(e))),
        }
    })
}

fn record(reader: &str, result: Result<(String, Result<String, String>), String>) {
    let mut p = placed();
    p.seq += 1;
    p.present = true;
    p.reader = Some(reader.to_string());
    p.at = now_ms();
    match result {
        Ok((uid, Ok(token))) => {
            p.uid = Some(uid);
            p.token = Some(token);
            p.error = None;
        }
        Ok((uid, Err(e))) => {
            p.uid = Some(uid);
            p.token = None;
            p.error = Some(e);
        }
        Err(e) => {
            p.uid = None;
            p.token = None;
            p.error = Some(e);
        }
    }
}

fn taken_off(reader: Option<&str>) {
    let mut p = placed();
    p.present = false;
    p.reader = reader.map(String::from);
}

/// Watches the first reader (client 2026-10-22): each card placed on it is read once and kept for
/// GET /card; taking it off clears `present`. Nothing is sent to a card while it lies there, so the
/// reader keeps track of it (its light follows the card). A reader plugged in or out, or the smart
/// card service restarting, starts the watch again.
fn watch() {
    loop {
        let ctx = match Context::establish(Scope::User) {
            Ok(c) => c,
            Err(_) => {
                taken_off(None);
                std::thread::sleep(Duration::from_secs(2));
                continue;
            }
        };
        let mut buf = [0u8; 2048];
        let reader = ctx
            .list_readers(&mut buf)
            .ok()
            .and_then(|mut r| r.next().map(|n| n.to_owned()));
        let Some(reader) = reader else {
            taken_off(None);
            std::thread::sleep(Duration::from_secs(1));
            continue;
        };
        let name = reader.to_string_lossy().into_owned();
        taken_off(Some(&name));
        let mut states = [ReaderState::new(reader, State::UNAWARE)];
        let mut on_reader = false;
        loop {
            match ctx.get_status_change(Duration::from_millis(1000), &mut states) {
                Ok(()) => {}
                Err(pcsc::Error::Timeout) => continue,
                Err(_) => break,
            }
            let state = states[0].event_state();
            states[0].sync_current_state();
            if state.intersects(State::UNKNOWN | State::UNAVAILABLE | State::IGNORE) {
                break;
            }
            let present = state.contains(State::PRESENT) && !state.contains(State::MUTE);
            if present && !on_reader {
                on_reader = true;
                std::thread::sleep(Duration::from_millis(SETTLE_MS));
                record(&name, read_placed());
            } else if !present && on_reader {
                on_reader = false;
                taken_off(Some(&name));
            }
        }
        taken_off(None);
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn card_json() -> Value {
    let p = placed().clone();
    json!({
        "seq": p.seq,
        "present": p.present,
        "reader": p.reader,
        "uid": p.uid,
        "token": p.token,
        "error": p.error,
        "at": p.at
    })
}

// ───────────────── TAURI COMMANDS (unchanged names) ─────────────────
#[command]
fn read_uid() -> Result<String, String> {
    do_read_uid()
}

#[command]
fn write_nfc_token(encrypted_token: String) -> Result<String, String> {
    do_write_token(&encrypted_token)
}

#[command]
fn read_nfc_token() -> Result<String, String> {
    do_read_token()
}

#[command]
fn reader_port() -> u16 {
    port()
}

// ───────────────── LOCAL SERVICE FOR THE WEB PAGES ─────────────────
fn port() -> u16 {
    std::env::var("CAMPUSONE_READER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

/// CampusOne's own sites over https, and web pages from this computer or the private network (or
/// CAMPUSONE_READER_ORIGINS when set).
fn origin_allowed(origin: &str) -> bool {
    if let Ok(list) = std::env::var("CAMPUSONE_READER_ORIGINS") {
        if !list.trim().is_empty() {
            return list.split(',').any(|o| o.trim().eq_ignore_ascii_case(origin));
        }
    }
    let lower = origin.to_ascii_lowercase();
    let (scheme, rest) = match lower.split_once("://") {
        Some((scheme, rest)) if ["http", "https", "tauri"].contains(&scheme) => (scheme, rest),
        _ => return false,
    };
    let host = rest.split(['/', ':']).next().unwrap_or("");
    if scheme == "https"
        && CAMPUSONE_DOMAINS
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{}", d)))
    {
        return true;
    }
    if ["localhost", "127.0.0.1", "tauri.localhost"].contains(&host) {
        return true;
    }
    let parts: Vec<u8> = host.split('.').filter_map(|p| p.parse().ok()).collect();
    if parts.len() != 4 || host.split('.').count() != 4 {
        return false;
    }
    parts[0] == 10
        || (parts[0] == 192 && parts[1] == 168)
        || (parts[0] == 172 && (16..=31).contains(&parts[1]))
}

fn header(name: &str, value: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn reply(req: tiny_http::Request, status: u16, body: Value, origin: Option<&str>) {
    let mut res = tiny_http::Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Cache-Control", "no-store"));
    if let Some(o) = origin {
        res = res
            .with_header(header("Access-Control-Allow-Origin", o))
            .with_header(header("Vary", "Origin"));
    }
    let _ = req.respond(res);
}

/// A card or reader problem: 503 when there is no reader, else 422.
fn problem(e: String) -> (u16, Value) {
    let status = if e.contains("No NFC reader") || e.contains("Context error") || e.contains("Reader error") {
        503
    } else {
        422
    };
    (status, json!({ "error": e }))
}

fn serve() {
    let port = port();
    let server = match tiny_http::Server::http(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("CampusOne Card Reader: port {} is not available ({}). Is it already running?", port, e);
            return;
        }
    };
    // One request at a time: the reader is never used twice at once.
    for mut req in server.incoming_requests() {
        let origin = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("Origin"))
            .map(|h| h.value.as_str().to_string());
        if let Some(o) = origin.as_deref() {
            if !origin_allowed(o) {
                reply(req, 403, json!({ "error": "This page may not use the card reader" }), None);
                continue;
            }
        }
        let allow = origin.as_deref();
        let method = req.method().clone();
        let path = req.url().split('?').next().unwrap_or("").to_string();

        if method == tiny_http::Method::Options {
            let mut res = tiny_http::Response::empty(204)
                .with_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
                .with_header(header("Access-Control-Allow-Headers", "Content-Type"))
                .with_header(header("Access-Control-Allow-Private-Network", "true"))
                .with_header(header("Access-Control-Max-Age", "600"));
            if let Some(o) = allow {
                res = res
                    .with_header(header("Access-Control-Allow-Origin", o))
                    .with_header(header("Vary", "Origin"));
            }
            let _ = req.respond(res);
            continue;
        }

        let (status, body) = match (&method, path.as_str()) {
            (tiny_http::Method::Get, "/status") => match reader_names() {
                Ok(readers) => (
                    200,
                    json!({
                        "ok": true,
                        "app": "CampusOne Card Reader",
                        "version": env!("CARGO_PKG_VERSION"),
                        "port": port,
                        "readers": readers,
                        "watching": true
                    }),
                ),
                Err(_) => (
                    200,
                    json!({
                        "ok": true,
                        "app": "CampusOne Card Reader",
                        "version": env!("CARGO_PKG_VERSION"),
                        "port": port,
                        "readers": [],
                        "watching": true
                    }),
                ),
            },
            (tiny_http::Method::Get, "/card") => (200, card_json()),
            (tiny_http::Method::Get, "/uid") => match do_read_uid() {
                Ok(uid) => (200, json!({ "uid": uid })),
                Err(e) => problem(e),
            },
            (tiny_http::Method::Get, "/token") => match do_read_token() {
                Ok(token) => (200, json!({ "token": token })),
                Err(e) => problem(e),
            },
            (tiny_http::Method::Post, "/token") => {
                let mut text = String::new();
                let _ = req.as_reader().take(4096).read_to_string(&mut text);
                let token = serde_json::from_str::<Value>(&text)
                    .ok()
                    .and_then(|v| v.get("token").and_then(|t| t.as_str()).map(String::from));
                match token {
                    Some(t) => match do_write_token(&t) {
                        Ok(_) => (200, json!({ "ok": true })),
                        Err(e) => problem(e),
                    },
                    None => (400, json!({ "error": "Send { \"token\": \"<base64>\" }" })),
                }
            }
            _ => (404, json!({ "error": "Not found" })),
        };
        reply(req, status, body, allow);
    }
}

// ───────────────── TAURI BOOT ─────────────────
/// Started by a CampusOne page (`campusone-reader://open`): stay minimised so the browser keeps focus.
fn launched_by_link(args: &[String]) -> bool {
    args.iter().any(|a| a.starts_with("campusone-reader:"))
}

fn main() {
    tauri::Builder::default()
        // One copy only: a second start (a link while it runs) just wakes the first.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !launched_by_link(&args) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // The pages open this app with campusone-reader:// links. The installer registers the
            // scheme; registering here as well makes it work in development and after a move.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            let args: Vec<String> = std::env::args().collect();
            if launched_by_link(&args) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.minimize();
                }
            }
            std::thread::spawn(watch);
            std::thread::spawn(serve);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_uid,
            write_nfc_token,
            read_nfc_token,
            reader_port
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}

#[cfg(test)]
mod tests {
    use super::{card_json, origin_allowed, record, retryable, taken_off};

    #[test]
    fn tries_again_only_what_a_reset_card_may_answer() {
        assert!(retryable("Card returned error: 63 00"));
        assert!(retryable("Authentication transmit failed: Timeout"));
        assert!(retryable("Read failed: UnresponsiveCard"));
        assert!(!retryable("Connect error: RemovedCard"));
        assert!(!retryable("No token found in NFC tag"));
        assert!(!retryable("No NFC reader found"));
    }

    #[test]
    fn counts_each_card_placed_and_keeps_its_serial_with_an_error() {
        record("ACR122U", Ok(("04A1B2C3".into(), Ok("TkZD".into()))));
        let first = card_json();
        assert_eq!(first["present"], true);
        assert_eq!(first["token"], "TkZD");
        // The same card placed again is another tap; a blank card keeps its serial.
        record("ACR122U", Ok(("04A1B2C3".into(), Err("No token found in NFC tag".into()))));
        taken_off(Some("ACR122U"));
        let second = card_json();
        assert_eq!(second["seq"].as_u64(), Some(first["seq"].as_u64().unwrap() + 1));
        assert_eq!(second["present"], false);
        assert_eq!(second["uid"], "04A1B2C3");
        assert!(second["token"].is_null());
        assert_eq!(second["error"], "No token found in NFC tag");
    }

    #[test]
    fn only_campusone_local_and_private_pages_may_call() {
        assert!(origin_allowed("http://localhost:4200"));
        assert!(origin_allowed("http://192.168.88.13:4200"));
        assert!(origin_allowed("https://10.0.0.5"));
        assert!(origin_allowed("http://172.20.1.1:4200"));
        assert!(origin_allowed("http://tauri.localhost"));
        assert!(origin_allowed("https://web.uat-campusone.com"));
        assert!(origin_allowed("https://console.campusone.in"));
        assert!(origin_allowed("https://campusone.in"));
        assert!(origin_allowed("https://www.campusone.com"));
        assert!(!origin_allowed("http://web.uat-campusone.com"));
        assert!(!origin_allowed("https://evilcampusone.in"));
        assert!(!origin_allowed("https://campusone.in.evil.com"));
        assert!(!origin_allowed("https://example.com"));
        assert!(!origin_allowed("http://192.168.evil.com"));
        assert!(!origin_allowed("http://172.40.1.1"));
        assert!(!origin_allowed("file://"));
    }
}
