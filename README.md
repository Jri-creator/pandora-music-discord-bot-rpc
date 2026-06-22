# Pandora → Discord Rich Presence

Show what you're listening to on Pandora in your Discord status — song title, artist, album art, live progress bar, and station name.

---

## ⚡ Quick Install (Recommended)

1. Go to the [**Releases**](../../releases/latest) page
2. Download **`pandora-discord-rpc.msi`** and run it
3. A setup page opens in your browser automatically
4. Enter your Discord App ID + Chrome Extension ID → click Save
5. Open Pandora, play music — done!

---

## What It Shows in Discord

| | |
|---|---|
| **Large image** | Album art, pulled live from Pandora's CDN |
| **Details** | Track title (e.g. *Riptide*) |
| **State** | Artist name (e.g. *by Vance Joy*) |
| **Small icon** | ▶ Playing / ⏸ Paused |
| **Timestamps** | Live progress bar with start → end time |
| **Button** | 📻 Station name, links to Pandora |

---

## How It Works

```
Pandora Web Player (Chrome)
        ↓  data-qa DOM scraping
Chrome Extension
        ↓  Chrome Native Messaging (stdin/stdout pipe)
Companion EXE (running in background)
        ↓  discord-rpc IPC socket
Discord Rich Presence
```

---

## Full Setup Guide

### Step 1 — Create a Discord Application (free, 2 min)

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it **Pandora**
3. Copy the **Application ID** from General Information
4. *(Optional)* Under **Rich Presence → Art Assets**, upload two small icons:
   - `playing` — a green play icon
   - `paused` — an orange pause icon

### Step 2 — Load the Chrome Extension

1. Download **`pandora-discord-rpc-extension.zip`** from Releases
2. Unzip it somewhere permanent (e.g. `C:\Users\You\PandoraRPC\extension`)
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** → select the unzipped `extension` folder
6. Copy your **Extension ID** (shown under the extension name)

### Step 3 — Install the Companion

**Option A: MSI installer (recommended)**
- Download and run `pandora-discord-rpc.msi`
- It installs to `Program Files`, adds a Start Menu shortcut, and starts on login
- On first launch, a setup page opens — enter your IDs and click Save

**Option B: Standalone EXE**
- Download `pandora-discord-rpc.exe` anywhere
- Double-click it — same setup page appears
- To run on startup, add a shortcut to `shell:startup`

---

## Building from Source

### Prerequisites
- Node.js 18+
- (For MSI) [WiX Toolset v4](https://wixtoolset.org/) + .NET SDK

```bash
git clone https://github.com/YOU/pandora-discord-rpc
cd pandora-discord-rpc/companion
npm install

# Build standalone EXE
npm run build:exe
# → ../dist/pandora-discord-rpc.exe

# Build MSI (Windows only, requires WiX)
wix build ../installer/pandora-rpc.wxs -ext WixToolset.UI.wixext -o ../dist/pandora-discord-rpc.msi
```

### GitHub Actions (automatic)

Push a version tag to trigger a full build + GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow (`.github/workflows/build.yml`) will:
1. Build `pandora-discord-rpc.exe` via **pkg**
2. Build `pandora-discord-rpc.msi` via **WiX 4**
3. Zip the Chrome extension
4. Create a GitHub Release with all three attached

### Optional: Pre-bake your Discord Client ID

Add a repository secret named `DISCORD_CLIENT_ID` in:
**Settings → Secrets and variables → Actions → New repository secret**

The build workflow will bake it into the EXE so users skip that step.

---

## Troubleshooting

**Status shows "disconnected" in the extension popup**
→ Make sure the companion EXE is running (check system tray / Task Manager)
→ Re-run the EXE if you recently reinstalled Chrome or the extension (new Extension ID)

**No rich presence showing in Discord**
→ Discord desktop must be open (not browser Discord)
→ Status only shows to others if you're not set to Invisible
→ Can take ~10 seconds to appear after a song starts

**Setup page won't load**
→ Make sure the EXE is still running (it hosts a local server on port 47843 during setup)

**Log file location:** `%TEMP%\pandora-discord-rpc.log`

---

## Project Structure

```
pandora-discord/
├── .github/
│   └── workflows/
│       └── build.yml          ← CI: builds EXE, MSI, and extension zip
├── extension/                 ← Load this folder in Chrome
│   ├── manifest.json
│   ├── content.js             ← Scrapes Pandora DOM (data-qa selectors)
│   ├── background.js          ← Native messaging bridge
│   ├── popup.html / popup.js  ← Extension popup UI
│   └── icons/
├── companion/                 ← Node.js app → compiled to EXE
│   ├── companion.js           ← Self-registering Discord RPC bridge
│   └── package.json
├── installer/
│   └── pandora-rpc.wxs        ← WiX MSI definition
└── README.md
```
