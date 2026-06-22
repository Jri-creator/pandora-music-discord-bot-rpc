// popup.js

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const mainContent = document.getElementById('mainContent');
const clearBtn   = document.getElementById('clearBtn');

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderTrack(track) {
  if (!track) {
    mainContent.innerHTML = `
      <div class="idle">
        <div class="idle__icon">🎧</div>
        <div>Open Pandora and play something<br>to share it on Discord.</div>
      </div>`;
    return;
  }

  const progressPct = track.duration > 0
    ? ((track.elapsed / track.duration) * 100).toFixed(1)
    : 0;

  const artHtml = track.artUrl
    ? `<img class="now-playing__art" src="${track.artUrl}" alt="Album art">`
    : `<div class="now-playing__art now-playing__art--placeholder">🎵</div>`;

  mainContent.innerHTML = `
    <div class="now-playing">
      ${artHtml}
      <div class="now-playing__info">
        <div class="now-playing__track">${escHtml(track.title)}</div>
        <div class="now-playing__artist">${escHtml(track.artist)}</div>
        ${track.album ? `<div class="now-playing__album">${escHtml(track.album)}</div>` : ''}
        ${track.station ? `<div class="now-playing__station">📻 ${escHtml(track.station)}</div>` : ''}
        <span class="now-playing__state ${track.playing ? 'state--playing' : 'state--paused'}">
          ${track.playing ? '▶ Playing' : '⏸ Paused'}
        </span>
      </div>
    </div>
    <div class="progress">
      <div class="progress__bar-bg">
        <div class="progress__bar-fill" style="width: ${progressPct}%"></div>
      </div>
      <div class="progress__times">
        <span>${formatTime(track.elapsed)}</span>
        <span>-${formatTime(track.duration - track.elapsed)}</span>
      </div>
    </div>`;
}

function renderStatus(status) {
  statusDot.className = `dot dot--${status}`;
  const labels = {
    connected: '✓ Connected to Discord',
    disconnected: '✗ Companion app not running',
    connecting: 'Connecting…'
  };
  statusText.textContent = labels[status] || status;

  if (status === 'disconnected') {
    const note = document.getElementById('setup-note') || (() => {
      const el = document.createElement('div');
      el.id = 'setup-note';
      mainContent.parentNode.insertBefore(el, mainContent);
      return el;
    })();
    note.innerHTML = `⚠️ The companion app isn't running. 
      See the <strong>README</strong> to install and start it.`;
  } else {
    const note = document.getElementById('setup-note');
    if (note) note.remove();
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Initial load
chrome.storage.local.get(['currentTrack', 'connectionStatus'], (data) => {
  renderTrack(data.currentTrack || null);
  renderStatus(data.connectionStatus || 'disconnected');
});

// Live updates while popup is open
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS_UPDATE') renderStatus(msg.connectionStatus);
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_ACTIVITY' }, () => {
    renderTrack(null);
  });
});
