// YouTube Timestamp Marker for yt2anki
// Usage: Press 'M' to mark start, 'M' again to mark end. Repeat for multiple clips.
// Press 'E' to export markers as JSON file.

(function() {
  // Prevent double initialization
  if (window.yt2ankiMarker) {
    window.yt2ankiMarker.toggle();
    return;
  }

  const state = {
    clips: [],
    currentStart: null,
    active: true,
  };

  // Create UI
  const ui = document.createElement('div');
  ui.id = 'yt2anki-ui';
  ui.innerHTML = `
    <style>
      #yt2anki-ui {
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        z-index: 999999;
        min-width: 200px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      #yt2anki-ui.hidden { display: none; }
      #yt2anki-ui h3 {
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #4CAF50;
      }
      #yt2anki-ui .hint {
        color: #888;
        font-size: 11px;
        margin-bottom: 8px;
      }
      #yt2anki-ui .status {
        padding: 6px 8px;
        background: #333;
        border-radius: 4px;
        margin: 8px 0;
      }
      #yt2anki-ui .status.recording {
        background: #c62828;
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      #yt2anki-ui .clips {
        max-height: 150px;
        overflow-y: auto;
        margin: 8px 0;
      }
      #yt2anki-ui .clip {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid #333;
      }
      #yt2anki-ui .clip .times { color: #81C784; }
      #yt2anki-ui .clip .remove {
        color: #e57373;
        cursor: pointer;
        margin-left: 8px;
      }
      #yt2anki-ui .buttons {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      #yt2anki-ui button {
        flex: 1;
        padding: 8px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      }
      #yt2anki-ui .btn-export {
        background: #4CAF50;
        color: white;
      }
      #yt2anki-ui .btn-export:hover { background: #43A047; }
      #yt2anki-ui .btn-clear {
        background: #555;
        color: white;
      }
      #yt2anki-ui .btn-clear:hover { background: #666; }
      #yt2anki-ui .btn-export:disabled {
        background: #333;
        cursor: not-allowed;
      }
    </style>
    <h3>🎯 yt2anki Marker</h3>
    <div class="hint">Press <kbd>M</kbd> to mark, <kbd>E</kbd> to export, <kbd>H</kbd> to hide</div>
    <div class="status" id="yt2anki-status">Ready - press M to start marking</div>
    <div class="clips" id="yt2anki-clips"></div>
    <div class="buttons">
      <button class="btn-export" id="yt2anki-export" disabled>Export JSON</button>
      <button class="btn-clear" id="yt2anki-clear">Clear All</button>
    </div>
  `;
  document.body.appendChild(ui);

  const statusEl = document.getElementById('yt2anki-status');
  const clipsEl = document.getElementById('yt2anki-clips');
  const exportBtn = document.getElementById('yt2anki-export');
  const clearBtn = document.getElementById('yt2anki-clear');

  function getVideo() {
    return document.querySelector('video');
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  function updateUI() {
    // Update clips list
    clipsEl.innerHTML = state.clips.map((clip, i) => `
      <div class="clip">
        <span>#${i + 1}</span>
        <span class="times">${formatTime(clip.start)} → ${formatTime(clip.end)}</span>
        <span class="remove" data-index="${i}">✕</span>
      </div>
    `).join('');

    // Update export button
    exportBtn.disabled = state.clips.length === 0;

    // Add remove handlers
    clipsEl.querySelectorAll('.remove').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.index);
        state.clips.splice(idx, 1);
        updateUI();
      };
    });
  }

  function mark() {
    const video = getVideo();
    if (!video) {
      statusEl.textContent = '⚠️ No video found';
      return;
    }

    const time = video.currentTime;

    if (state.currentStart === null) {
      // Start marking
      state.currentStart = time;
      statusEl.textContent = `🔴 Recording from ${formatTime(time)}... press M to end`;
      statusEl.classList.add('recording');
    } else {
      // End marking
      const start = state.currentStart;
      const end = time;

      if (end > start) {
        state.clips.push({ start, end });
        statusEl.textContent = `✓ Clip added: ${formatTime(start)} → ${formatTime(end)}`;
      } else {
        statusEl.textContent = '⚠️ End must be after start';
      }

      state.currentStart = null;
      statusEl.classList.remove('recording');
      updateUI();
    }
  }

  function exportMarkers() {
    if (state.clips.length === 0) return;

    const data = {
      url: window.location.href,
      exportedAt: new Date().toISOString(),
      clips: state.clips.map(c => ({
        start: c.start,
        end: c.end,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yt2anki-markers-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    statusEl.textContent = `✓ Exported ${state.clips.length} clips`;
  }

  function toggle() {
    state.active = !state.active;
    ui.classList.toggle('hidden', !state.active);
  }

  // Keyboard handler
  function handleKey(e) {
    // Ignore if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    if (key === 'm') {
      e.preventDefault();
      mark();
    } else if (key === 'e') {
      e.preventDefault();
      exportMarkers();
    } else if (key === 'h') {
      e.preventDefault();
      toggle();
    }
  }

  document.addEventListener('keydown', handleKey);

  // Button handlers
  exportBtn.onclick = exportMarkers;
  clearBtn.onclick = () => {
    state.clips = [];
    state.currentStart = null;
    statusEl.textContent = 'Cleared - press M to start marking';
    statusEl.classList.remove('recording');
    updateUI();
  };

  // Expose toggle for re-running bookmarklet
  window.yt2ankiMarker = { toggle };

  console.log('yt2anki marker initialized. Press M to mark, E to export, H to hide.');
})();
