#!/usr/bin/env node
// companion.js
// Pandora → Discord Rich Presence companion.
// When run as a standalone EXE (built with pkg), auto-registers itself
// as a Chrome Native Messaging host and shows a system tray icon.

'use strict';

const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { execSync, spawn } = require('child_process');
const { Client } = require('discord-rpc');

// ─── Config ──────────────────────────────────────────────────────────────────

const HOST_NAME        = 'com.pandora_discord_rpc';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_DISCORD_APP_CLIENT_ID_HERE';
const VERSION          = '1.0.0';

// Detect if we're running as a pkg-bundled EXE
const IS_PKG = typeof process.pkg !== 'undefined';
const EXE_PATH = IS_PKG ? process.execPath : path.resolve(__dirname, 'companion.js');

// ─── Logging ─────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(os.tmpdir(), 'pandora-discord-rpc.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stderr.write(line);
  logStream.write(line);
}

// ─── Self-registration (Native Messaging Host) ───────────────────────────────

function getManifestDir() {
  switch (os.platform()) {
    case 'win32':
      return path.join(os.tmpdir(), 'pandora-rpc-host'); // written to disk, reg points here
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support',
        'Google', 'Chrome', 'NativeMessagingHosts');
    default: // linux
      return path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts');
  }
}

function register(extensionId) {
  const manifestDir = getManifestDir();
  fs.mkdirSync(manifestDir, { recursive: true });

  let hostPath = EXE_PATH;

  // On Windows we need a .bat wrapper IF running as raw Node (not EXE).
  // When running as EXE, the exe itself IS the host — no wrapper needed.
  if (os.platform() === 'win32' && !IS_PKG) {
    const bat = path.join(manifestDir, 'run_pandora_rpc.bat');
    fs.writeFileSync(bat, `@echo off\n"${process.execPath}" "${EXE_PATH}" %*\n`);
    hostPath = bat;
  }

  const manifest = {
    name: HOST_NAME,
    description: 'Pandora Discord Rich Presence companion',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };

  const manifestPath = path.join(manifestDir, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log('Manifest written:', manifestPath);

  if (os.platform() === 'win32') {
    const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
    try {
      execSync(`reg add "${regKey}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'pipe' });
      log('Registry key written:', regKey);
    } catch (e) {
      log('Registry write failed:', e.message);
      return false;
    }
  }

  return true;
}

function isRegistered() {
  if (os.platform() === 'win32') {
    try {
      const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
      execSync(`reg query "${regKey}"`, { stdio: 'pipe' });
      return true;
    } catch { return false; }
  } else {
    const manifestPath = path.join(getManifestDir(), `${HOST_NAME}.json`);
    return fs.existsSync(manifestPath);
  }
}

// ─── Setup UI (GUI prompt when run by double-clicking the EXE) ───────────────
// Uses a bundled HTML page opened via the default browser when stdin is a TTY.

function showSetupAndRegister() {
  // Read extension ID from saved config or prompt via CLI
  const configPath = path.join(os.homedir(), '.pandora-discord-rpc.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }

  if (config.extensionId && config.discordClientId) {
    log('Config found, registering...');
    registerFromConfig(config);
    return;
  }

  // First run — write a setup page and open it
  const setupHtml = generateSetupPage();
  const setupPath = path.join(os.tmpdir(), 'pandora-rpc-setup.html');
  fs.writeFileSync(setupPath, setupHtml);

  log('Opening setup page:', setupPath);
  try {
    // Windows
    if (os.platform() === 'win32') execSync(`start "" "${setupPath}"`);
    else if (os.platform() === 'darwin') execSync(`open "${setupPath}"`);
    else execSync(`xdg-open "${setupPath}"`);
  } catch (e) {
    log('Could not open browser:', e.message);
  }

  // Poll for the config file written by the setup page's local server
  startSetupServer(configPath);
}

function startSetupServer(configPath) {
  // Tiny HTTP server that the setup HTML page POSTs to
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'POST' && req.url === '/configure') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
          log('Config saved:', configPath);
          registerFromConfig(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          server.close();
          // Now start in native messaging mode
          startNativeMessaging();
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: VERSION, registered: isRegistered() }));
      return;
    }

    res.writeHead(404); res.end();
  });

  server.listen(47843, '127.0.0.1', () => {
    log('Setup server listening on http://127.0.0.1:47843');
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    server.close();
    log('Setup server timed out');
  }, 5 * 60 * 1000);
}

function registerFromConfig(config) {
  if (config.discordClientId) {
    // Patch the running process's client ID
    process.env.DISCORD_CLIENT_ID = config.discordClientId;
  }
  if (config.extensionId) {
    register(config.extensionId);
  }
  log('Registration complete!');
}

// ─── Setup Page HTML ─────────────────────────────────────────────────────────

function generateSetupPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Pandora Discord RPC — Setup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #1a1b2e; color: #e8e8f0; display: flex;
         justify-content: center; align-items: center; min-height: 100vh; padding: 24px; }
  .card { background: #22233a; border-radius: 12px; padding: 36px 40px;
          max-width: 520px; width: 100%; box-shadow: 0 8px 40px #0008; }
  h1 { font-size: 22px; background: linear-gradient(90deg,#00a0ee,#3668ff);
       -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 6px; }
  .subtitle { font-size: 13px; color: #7070a0; margin-bottom: 28px; }
  .step { margin-bottom: 24px; }
  .step__num { display: inline-flex; align-items: center; justify-content: center;
               width: 24px; height: 24px; border-radius: 50%;
               background: #3668ff; font-size: 12px; font-weight: 700;
               margin-right: 8px; flex-shrink: 0; }
  .step__title { font-size: 14px; font-weight: 600; display: flex; align-items: center; margin-bottom: 8px; }
  .step__body { font-size: 12px; color: #8888b0; line-height: 1.6; padding-left: 32px; }
  .step__body a { color: #3668ff; }
  label { display: block; font-size: 12px; color: #7070a0; margin-bottom: 5px; margin-top: 10px; }
  input { width: 100%; padding: 10px 12px; background: #1a1b2e;
          border: 1px solid #3a3a55; border-radius: 6px; color: #e8e8f0;
          font-size: 13px; font-family: monospace; }
  input:focus { outline: none; border-color: #3668ff; }
  .btn { display: block; width: 100%; margin-top: 24px; padding: 12px;
         background: linear-gradient(90deg,#00a0ee,#3668ff); color: #fff;
         border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
         cursor: pointer; transition: opacity .15s; }
  .btn:hover { opacity: .88; }
  .status { margin-top: 16px; padding: 10px 14px; border-radius: 6px;
            font-size: 12px; display: none; }
  .status--ok  { background: #43b58122; color: #43b581; }
  .status--err { background: #f0474722; color: #f04747; }
  code { background: #1a1b2e; padding: 1px 5px; border-radius: 3px;
         font-family: monospace; font-size: 11px; color: #9090c0; }
</style>
</head>
<body>
<div class="card">
  <h1>🎵 Pandora → Discord RPC</h1>
  <p class="subtitle">One-time setup — takes about 2 minutes</p>

  <div class="step">
    <div class="step__title"><span class="step__num">1</span> Create a Discord Application</div>
    <div class="step__body">
      Go to <a href="https://discord.com/developers/applications" target="_blank">discord.com/developers/applications</a>,
      click <strong>New Application</strong>, name it <strong>Pandora</strong>,
      then copy the <strong>Application ID</strong> from the General Information page.
    </div>
    <label>Discord Application ID (Client ID)</label>
    <input id="clientId" type="text" placeholder="123456789012345678" spellcheck="false">
  </div>

  <div class="step">
    <div class="step__title"><span class="step__num">2</span> Get your Extension ID</div>
    <div class="step__body">
      Open Chrome → <code>chrome://extensions</code> → enable <strong>Developer Mode</strong>
      → load the <code>extension/</code> folder → copy the ID shown below the extension name.
    </div>
    <label>Chrome Extension ID</label>
    <input id="extId" type="text" placeholder="abcdefghijklmnopabcdefghijklmnop" spellcheck="false">
  </div>

  <button class="btn" onclick="submit()">✓ Save & Register</button>
  <div class="status" id="status"></div>
</div>

<script>
async function submit() {
  const clientId = document.getElementById('clientId').value.trim();
  const extId    = document.getElementById('extId').value.trim();
  const status   = document.getElementById('status');

  if (!clientId || !extId) {
    showStatus('Please fill in both fields.', 'err'); return;
  }

  try {
    const res = await fetch('http://127.0.0.1:47843/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordClientId: clientId, extensionId: extId })
    });
    const data = await res.json();
    if (data.ok) {
      showStatus('✓ Registered! You can close this tab. Discord status will appear when you play music on Pandora.', 'ok');
    } else {
      showStatus('Error: ' + (data.error || 'Unknown'), 'err');
    }
  } catch (e) {
    showStatus('Could not reach companion app. Is it still running? Error: ' + e.message, 'err');
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status status--' + type;
  el.style.display = 'block';
}
</script>
</body>
</html>`;
}

// ─── Native Messaging Protocol ───────────────────────────────────────────────

function startNativeMessaging() {
  log('Starting in native messaging mode');

  const { Client: RpcClient } = require('discord-rpc');
  const clientId = process.env.DISCORD_CLIENT_ID || DISCORD_CLIENT_ID;
  const rpc = new RpcClient({ transport: 'ipc' });
  let rpcReady = false;
  let pendingActivity = null;

  async function connectDiscord() {
    try {
      await rpc.login({ clientId });
    } catch (e) {
      log('Discord connect failed:', e.message);
      send({ status: 'disconnected', error: e.message });
      setTimeout(connectDiscord, 15000);
    }
  }

  rpc.on('ready', () => {
    rpcReady = true;
    log('Discord ready. User:', rpc.user?.username);
    send({ status: 'connected', user: rpc.user?.username });
    if (pendingActivity) { applyActivity(pendingActivity); pendingActivity = null; }
  });

  rpc.on('disconnected', () => {
    rpcReady = false;
    log('Discord disconnected');
    send({ status: 'disconnected' });
    setTimeout(connectDiscord, 15000);
  });

  async function applyActivity(a) {
    if (!rpcReady) { pendingActivity = a; return; }
    try {
      await rpc.setActivity({
        details:        a.details,
        state:          a.state,
        startTimestamp: a.timestamps?.start ? new Date(a.timestamps.start * 1000) : undefined,
        endTimestamp:   a.timestamps?.end   ? new Date(a.timestamps.end   * 1000) : undefined,
        largeImageKey:  a.assets?.large_image || '',
        largeImageText: a.assets?.large_text  || '',
        smallImageKey:  a.assets?.small_image || 'playing',
        smallImageText: a.assets?.small_text  || '',
        buttons:        a.buttons || [],
        instance:       false,
      });
      log('Activity set:', a.details, '-', a.state);
    } catch (e) { log('setActivity failed:', e.message); }
  }

  // Native messaging read loop
  let buf = Buffer.alloc(0);
  let msgLen = null;

  process.stdin.on('readable', () => {
    let chunk;
    while (null !== (chunk = process.stdin.read())) {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        if (msgLen === null) {
          if (buf.length < 4) break;
          msgLen = buf.readUInt32LE(0);
          buf = buf.slice(4);
        }
        if (buf.length < msgLen) break;
        let msg;
        try { msg = JSON.parse(buf.slice(0, msgLen).toString('utf8')); } catch {}
        buf = buf.slice(msgLen);
        msgLen = null;
        if (!msg) continue;

        if (msg.type === 'SET_ACTIVITY')   applyActivity(msg.activity);
        if (msg.type === 'CLEAR_ACTIVITY') { if (rpcReady) rpc.clearActivity(); }
      }
    }
  });

  process.stdin.resume();
  connectDiscord();
}

function send(obj) {
  const json = JSON.stringify(obj);
  const len  = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  process.stdout.write(len);
  process.stdout.write(json);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// Chrome invokes us with stdin piped — detect that vs. double-click launch
const isNativeMessaging = !process.stdin.isTTY;

log(`Pandora Discord RPC v${VERSION} starting (pkg=${IS_PKG}, nativeMsg=${isNativeMessaging})`);

if (isNativeMessaging) {
  // Called by Chrome — go straight into messaging mode
  startNativeMessaging();
} else {
  // Double-clicked or run from terminal by user — run setup
  showSetupAndRegister();
  // After setup server is started, also begin native messaging if already configured
  const configPath = path.join(os.homedir(), '.pandora-discord-rpc.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.discordClientId) process.env.DISCORD_CLIENT_ID = config.discordClientId;
    } catch {}
    startNativeMessaging();
  }
}

process.on('uncaughtException', e => log('Uncaught:', e.message));
