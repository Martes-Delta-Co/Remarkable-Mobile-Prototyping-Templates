// Device subsystem — compiled only with `--features device`.
// SSH install/sync (russh, tar-over-exec — no SFTP, mirroring install.sh),
// USB-web backup (ureq -> /documents + /download/.../rmdoc), keychain secrets.
//
// NOTE: written against russh 0.45; requires a physical reMarkable to verify
// end-to-end. The transport deliberately uses an exec channel running
// `tar xf - -C <xochitl>` (the device exposes no SFTP subsystem).

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::sync::Arc;

use crate::commands::DeviceInfo;

const HOST: &str = "10.11.99.1";
const XOCHITL: &str = "/home/root/.local/share/remarkable/xochitl/";
const KEYRING_SERVICE: &str = "rmux-templates";

pub async fn detect() -> Result<DeviceInfo> {
    let reachable = tokio::net::TcpStream::connect((HOST, 22)).await.is_ok();
    Ok(DeviceInfo {
        reachable,
        ip: HOST.into(),
        model: None,
        software: None,
    })
}

// ---- SSH (russh) ----

struct Client;

#[async_trait]
impl russh::client::Handler for Client {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _key: &russh::keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // The device host key rotates after every software update; accept on trust.
        Ok(true)
    }
}

async fn connect(ip: &str, password: &str) -> Result<russh::client::Handle<Client>> {
    let config = Arc::new(russh::client::Config::default());
    let mut handle = russh::client::connect(config, (ip, 22), Client).await?;
    if !handle.authenticate_password("root", password).await? {
        return Err(anyhow!("authentication failed (check the device password)"));
    }
    Ok(handle)
}

async fn exec_capture(handle: &russh::client::Handle<Client>, cmd: &str) -> Result<(u32, String)> {
    let mut ch = handle.channel_open_session().await?;
    ch.exec(true, cmd.to_string()).await?;
    let mut out = Vec::new();
    let mut code = 0u32;
    loop {
        match ch.wait().await {
            Some(russh::ChannelMsg::Data { ref data }) => out.extend_from_slice(data),
            Some(russh::ChannelMsg::ExitStatus { exit_status }) => code = exit_status,
            Some(russh::ChannelMsg::Eof) | None => break,
            _ => {}
        }
    }
    Ok((code, String::from_utf8_lossy(&out).into_owned()))
}

pub async fn identify(ip: &str, password: &str) -> Result<DeviceInfo> {
    let handle = connect(ip, password).await?;
    let (_, ver) = exec_capture(
        &handle,
        "cat /etc/version 2>/dev/null; cat /sys/devices/soc0/machine 2>/dev/null",
    )
    .await?;
    let software = ver.lines().next().map(|s| s.trim().to_string());
    let model = ver.lines().nth(1).map(|s| s.trim().to_string());
    Ok(DeviceInfo {
        reachable: true,
        ip: ip.into(),
        model,
        software,
    })
}

pub async fn list_installed(ip: &str, password: &str) -> Result<Vec<String>> {
    let handle = connect(ip, password).await?;
    let (_, out) = exec_capture(
        &handle,
        &format!("ls {XOCHITL} 2>/dev/null | grep '^uxtpl_' | grep '[.]template$'"),
    )
    .await?;
    Ok(out
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect())
}

pub async fn uninstall_all(ip: &str, password: &str) -> Result<()> {
    let handle = connect(ip, password).await?;
    exec_capture(
        &handle,
        &format!("rm -f {XOCHITL}uxtpl_* ; systemctl restart xochitl"),
    )
    .await?;
    Ok(())
}

/// Install `files` (filename, bytes) by streaming a tar to `tar xf - -C <xochitl>`.
/// `mirror` first removes the existing uxtpl_* set so the device matches the selection.
pub async fn install(
    ip: &str,
    password: &str,
    files: Vec<(String, Vec<u8>)>,
    mirror: bool,
) -> Result<(usize, usize)> {
    let handle = connect(ip, password).await?;

    let mut removed = 0usize;
    if mirror {
        removed = list_installed(ip, password).await.map(|v| v.len()).unwrap_or(0);
        exec_capture(&handle, &format!("rm -f {XOCHITL}uxtpl_*")).await?;
    }

    // Build the tar archive in memory.
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut b = tar::Builder::new(&mut buf);
        for (name, bytes) in &files {
            let mut hdr = tar::Header::new_gnu();
            hdr.set_size(bytes.len() as u64);
            hdr.set_mode(0o644);
            hdr.set_cksum();
            b.append_data(&mut hdr, name, bytes.as_slice())?;
        }
        b.finish()?;
    }

    // Stream it to the device and restart the UI.
    let mut ch = handle.channel_open_session().await?;
    ch.exec(true, format!("tar xf - -C {XOCHITL} && systemctl restart xochitl"))
        .await?;
    ch.data(buf.as_slice()).await?;
    ch.eof().await?;
    loop {
        match ch.wait().await {
            Some(russh::ChannelMsg::Eof) | None => break,
            _ => {}
        }
    }
    Ok((files.len(), removed))
}

// ---- USB Web Interface backup (no SSH / no Dev Mode) ----

/// Download every notebook as a lossless `.rmdoc` into `dest`. Returns the count.
pub fn backup_documents(dest: &str) -> Result<usize> {
    let base = format!("http://{HOST}");

    fn walk(base: &str, guid: &str, acc: &mut Vec<serde_json::Value>) -> Result<()> {
        let url = format!("{base}/documents/{guid}");
        let text = ureq::get(&url).call()?.into_string()?;
        let body: serde_json::Value = serde_json::from_str(&text)?;
        if let Some(arr) = body.as_array() {
            for e in arr {
                let is_folder = e.get("Type").and_then(|v| v.as_str()) == Some("CollectionType");
                let id = e.get("ID").and_then(|v| v.as_str()).unwrap_or("");
                if is_folder {
                    walk(base, id, acc)?;
                } else {
                    acc.push(e.clone());
                }
            }
        }
        Ok(())
    }

    let mut docs = Vec::new();
    walk(&base, "", &mut docs)?;
    std::fs::create_dir_all(dest)?;

    for d in &docs {
        let id = d.get("ID").and_then(|v| v.as_str()).unwrap_or("");
        // the device API historically spells it "VissibleName"
        let name = d
            .get("VissibleName")
            .or_else(|| d.get("VisibleName"))
            .and_then(|v| v.as_str())
            .unwrap_or(id);
        let safe: String = name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
            .collect();
        let url = format!("{base}/download/{id}/rmdoc");
        let resp = ureq::get(&url).call()?;
        let mut reader = resp.into_reader();
        let path = std::path::Path::new(dest).join(format!("{safe}_{id}.rmdoc"));
        let mut f = std::fs::File::create(path)?;
        std::io::copy(&mut reader, &mut f)?;
    }
    Ok(docs.len())
}

// ---- secrets (OS keychain) ----

#[allow(dead_code)]
pub fn save_password(device_id: &str, password: &str) -> Result<()> {
    keyring::Entry::new(KEYRING_SERVICE, device_id)?.set_password(password)?;
    Ok(())
}

#[allow(dead_code)]
pub fn get_password(device_id: &str) -> Result<Option<String>> {
    match keyring::Entry::new(KEYRING_SERVICE, device_id)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}
