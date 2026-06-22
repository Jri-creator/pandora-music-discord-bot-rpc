// background.js — service worker
// Receives track data from content.js and forwards it to the native companion app
// via Chrome Native Messaging.

const NATIVE_HOST = 'com.pandora_discord_rpc';

let nativePort = null;
let currentTrack = null;
let connectionStatus = 'disconnected';

// ─── Native Messaging ───────────────────────────────────────────────────────

function connectNative() {
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener((msg) => {
      console.log('[Pandora RPC] Native response:', msg);
      if (msg.status) {
        connectionStatus = msg.status;
        broadcastStatus();
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.warn('[Pandora RPC] Native disconnected:', err?.message);
      nativePort = null;
      connectionStatus = 'disconnected';
      broadcastStatus();
      // Retry after 10 seconds
      setTimeout(connectNative, 10000);
    });

    connectionStatus = 'connected';
    broadcastStatus();
    console.log('[Pandora RPC] Connected to native host');
  } catch (e) {
    console.error('[Pandora RPC] Failed to connect native host:', e);
    connectionStatus = 'disconnected';
    setTimeout(connectNative, 10000);
  }
}

function sendToNative(message) {
  if (!nativePort) {
    connectNative();
    return;
  }
  try {
    nativePort.postMessage(message);
  } catch (e) {
    console.error('[Pandora RPC] Send error:', e);
    nativePort = null;
    connectNative();
  }
}

// ─── Message handling from content script ───────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PANDORA_TRACK_UPDATE') {
    const track = msg.payload;
    currentTrack = track;

    // Calculate Discord timestamps
    const now = Math.floor(Date.now() / 1000);
    const startTimestamp = track.playing ? now - track.elapsed : null;
    const endTimestamp   = track.playing && track.duration > 0
      ? now + (track.duration - track.elapsed)
      : null;

    sendToNative({
      type: 'SET_ACTIVITY',
      activity: {
        details: track.title,
        state: `by ${track.artist}`,
        assets: {
          large_image: track.artUrl,
          large_text: track.album || track.title,
          small_image: track.playing ? 'playing' : 'paused',
          small_text: track.playing ? 'Playing' : 'Paused'
        },
        timestamps: startTimestamp ? {
          start: startTimestamp,
          end: endTimestamp
        } : null,
        buttons: [
          {
            label: `🎵 ${track.station}`,
            url: `https://www.pandora.com/station/play/${track.station.replace(/\s+/g, '-').toLowerCase()}`
          }
        ]
      }
    });

    // Persist for popup
    chrome.storage.local.set({ currentTrack, connectionStatus });
    sendResponse({ ok: true });
  }

  if (msg.type === 'PANDORA_PROGRESS_UPDATE') {
    // Silently update timestamps without triggering a full RPC call
    // (handled by the companion app's own interval)
  }

  if (msg.type === 'GET_STATUS') {
    sendResponse({ currentTrack, connectionStatus });
  }

  if (msg.type === 'CLEAR_ACTIVITY') {
    sendToNative({ type: 'CLEAR_ACTIVITY' });
    currentTrack = null;
    chrome.storage.local.set({ currentTrack: null });
    sendResponse({ ok: true });
  }

  return true; // keep channel open for async sendResponse
});

// ─── Broadcast status to popup ───────────────────────────────────────────────

function broadcastStatus() {
  chrome.storage.local.set({ connectionStatus });
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', connectionStatus }).catch(() => {});
}

// ─── Init ────────────────────────────────────────────────────────────────────

connectNative();
