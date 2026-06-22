#!/usr/bin/env node
// install-host.js
// Registers this companion app as a Chrome Native Messaging host.
// Run once after npm install: node install-host.js <EXTENSION_ID>
//
// Usage:
//   node install-host.js abc123youextensionidhere

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const EXT_ID = process.argv[2];
if (!EXT_ID) {
  console.error('Usage: node install-host.js <YOUR_CHROME_EXTENSION_ID>');
  process.exit(1);
}

const HOST_NAME     = 'com.pandora_discord_rpc';
const COMPANION_JS  = path.resolve(__dirname, 'companion.js');
const NODE_BIN      = process.execPath;

// Wrapper script so Chrome can invoke Node without knowing its path
const platform = os.platform();

let wrapperPath;
let hostPath;

if (platform === 'win32') {
  // Windows: use a .bat wrapper
  wrapperPath = path.join(__dirname, 'run_companion.bat');
  fs.writeFileSync(wrapperPath, `@echo off\n"${NODE_BIN}" "${COMPANION_JS}" %*\n`);

  const manifest = {
    name: HOST_NAME,
    description: 'Pandora Discord Rich Presence companion',
    path: wrapperPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXT_ID}/`]
  };

  const manifestPath = path.join(__dirname, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Write to registry
  const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
  try {
    execSync(`reg add "${regKey}" /ve /t REG_SZ /d "${manifestPath.replace(/\\/g, '\\\\')}" /f`);
    console.log('✓ Registry key written:', regKey);
  } catch (e) {
    console.error('Failed to write registry key. Try running as Administrator.');
    console.error(e.message);
    process.exit(1);
  }

} else if (platform === 'darwin') {
  // macOS: shell wrapper
  wrapperPath = path.join(__dirname, 'run_companion.sh');
  fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec "${NODE_BIN}" "${COMPANION_JS}" "$@"\n`);
  fs.chmodSync(wrapperPath, '755');

  const manifest = {
    name: HOST_NAME,
    description: 'Pandora Discord Rich Presence companion',
    path: wrapperPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXT_ID}/`]
  };

  hostPath = path.join(os.homedir(), 'Library', 'Application Support',
    'Google', 'Chrome', 'NativeMessagingHosts');
  fs.mkdirSync(hostPath, { recursive: true });

  const manifestPath = path.join(hostPath, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✓ Manifest written to:', manifestPath);

} else {
  // Linux
  wrapperPath = path.join(__dirname, 'run_companion.sh');
  fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec "${NODE_BIN}" "${COMPANION_JS}" "$@"\n`);
  fs.chmodSync(wrapperPath, '755');

  const manifest = {
    name: HOST_NAME,
    description: 'Pandora Discord Rich Presence companion',
    path: wrapperPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXT_ID}/`]
  };

  hostPath = path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts');
  fs.mkdirSync(hostPath, { recursive: true });

  const manifestPath = path.join(hostPath, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✓ Manifest written to:', manifestPath);
}

console.log('\n✅ Native messaging host installed!');
console.log('   Now start the companion with:  npm start');
console.log('   Then open Discord and Pandora, and enjoy your status!\n');
