// content.js — injected into pandora.com
// Reads the now-playing data from the DOM and sends it to the background worker.

(function () {
  let lastTrackKey = null;
  let pollInterval = null;

  function getTrackData() {
    try {
      const titleEl    = document.querySelector('[data-qa="playing_track_title"]');
      const artistEl   = document.querySelector('[data-qa="playing_artist_name"]');
      const albumEl    = document.querySelector('[data-qa="playing_album_name"]');
      const stationEl  = document.querySelector('[data-qa="station_active_name"]');
      const artEl      = document.querySelector('[data-qa="album_active_image"] img');
      const playBtn    = document.querySelector('[data-qa="pause_button"]');
      const elapsedEl  = document.querySelector('[data-qa="elapsed_time"]');
      const remainEl   = document.querySelector('[data-qa="remaining_time"]');
      const progressEl = document.querySelector('.TunerProgress__Progress');

      if (!titleEl || !artistEl) return null;

      const title   = titleEl.textContent.trim();
      const artist  = artistEl.textContent.trim();
      const album   = albumEl  ? albumEl.textContent.trim()  : '';
      const station = stationEl ? stationEl.textContent.trim() : '';
      const artUrl  = artEl   ? artEl.src.replace(/\d+W_\d+H/, '500W_500H') : '';
      const playing = playBtn ? playBtn.getAttribute('aria-checked') === 'true' : false;

      // Parse elapsed / remaining into seconds
      const parseTime = (str) => {
        if (!str) return 0;
        const parts = str.trim().split(':').map(Number);
        return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
      };

      const elapsed   = parseTime(elapsedEl  ? elapsedEl.textContent  : '0:00');
      const remaining = parseTime(remainEl   ? remainEl.textContent   : '0:00');
      const duration  = elapsed + remaining;

      // translateX(-14.04%) → 14.04 → progress fraction
      let progress = 0;
      if (progressEl) {
        const match = progressEl.style.transform.match(/translateX\((-?[\d.]+)%\)/);
        if (match) progress = Math.abs(parseFloat(match[1])) / 100;
      }

      return { title, artist, album, station, artUrl, playing, elapsed, duration, progress };
    } catch (e) {
      return null;
    }
  }

  function sendUpdate() {
    const data = getTrackData();
    if (!data) return;

    // Only send if something changed (avoid spamming the background)
    const key = `${data.title}|${data.artist}|${data.playing}`;
    if (key !== lastTrackKey) {
      lastTrackKey = key;
      chrome.runtime.sendMessage({ type: 'PANDORA_TRACK_UPDATE', payload: data });
    }

    // Always send progress updates so the timestamp stays accurate
    chrome.runtime.sendMessage({ type: 'PANDORA_PROGRESS_UPDATE', payload: {
      elapsed: data.elapsed,
      duration: data.duration,
      playing: data.playing
    }});
  }

  // Start polling
  function start() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(sendUpdate, 2000); // every 2 seconds
    sendUpdate(); // immediate first call
  }

  // Wait for the player to be ready (SPA — DOM loads after page)
  function waitForPlayer() {
    const check = setInterval(() => {
      if (document.querySelector('[data-qa="playing_track_title"]')) {
        clearInterval(check);
        start();
      }
    }, 1000);
  }

  waitForPlayer();

  // Re-trigger on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      waitForPlayer();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
