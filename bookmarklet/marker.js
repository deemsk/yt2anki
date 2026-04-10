// YouTube Timestamp Marker for DerDieDeck
// CSP-compliant version using DOM APIs

(function() {
  if (window.derDieDeckMarker) {
    window.derDieDeckMarker.toggle();
    return;
  }

  const state = { clips: [], currentStart: null, active: true };

  // Create style element
  const style = document.createElement('style');
  style.textContent = `
    #derdiedeck-ui {
      position: fixed; top: 10px; right: 10px;
      background: rgba(0,0,0,0.9); color: white;
      padding: 12px 16px; border-radius: 8px;
      font-family: -apple-system, sans-serif; font-size: 13px;
      z-index: 999999; min-width: 200px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    #derdiedeck-ui.hidden { display: none; }
    #derdiedeck-ui h3 { margin: 0 0 8px; font-size: 14px; color: #4CAF50; }
    #derdiedeck-ui .hint { color: #888; font-size: 11px; margin-bottom: 8px; }
    #derdiedeck-ui .status { padding: 6px 8px; background: #333; border-radius: 4px; margin: 8px 0; }
    #derdiedeck-ui .status.recording { background: #c62828; animation: derdiedeck-pulse 1s infinite; }
    @keyframes derdiedeck-pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
    #derdiedeck-ui .clips { max-height: 150px; overflow-y: auto; margin: 8px 0; }
    #derdiedeck-ui .clip { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333; }
    #derdiedeck-ui .clip .times { color: #81C784; }
    #derdiedeck-ui .clip .remove { color: #e57373; cursor: pointer; margin-left: 8px; }
    #derdiedeck-ui .buttons { display: flex; gap: 8px; margin-top: 8px; }
    #derdiedeck-ui button { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; }
    #derdiedeck-ui .btn-export { background: #4CAF50; color: white; }
    #derdiedeck-ui .btn-export:disabled { background: #333; cursor: not-allowed; }
    #derdiedeck-ui .btn-clear { background: #555; color: white; }
  `;
  document.head.appendChild(style);

  // Build UI with DOM APIs
  const ui = document.createElement('div');
  ui.id = 'derdiedeck-ui';

  const title = document.createElement('h3');
  title.textContent = 'DerDieDeck Marker';
  ui.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'M = mark, E = copy, H = hide';
  ui.appendChild(hint);

  const statusEl = document.createElement('div');
  statusEl.className = 'status';
  statusEl.textContent = 'Ready - press M to start';
  ui.appendChild(statusEl);

  const clipsEl = document.createElement('div');
  clipsEl.className = 'clips';
  ui.appendChild(clipsEl);

  const buttons = document.createElement('div');
  buttons.className = 'buttons';

  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn-export';
  sendBtn.textContent = 'Copy';
  sendBtn.disabled = true;
  buttons.appendChild(sendBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn-clear';
  clearBtn.textContent = 'Clear';
  buttons.appendChild(clearBtn);

  ui.appendChild(buttons);
  document.body.appendChild(ui);

  function getVideo() { return document.querySelector('video'); }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return m + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
  }

  function updateUI() {
    clipsEl.textContent = '';
    const reversed = [...state.clips].reverse();
    reversed.forEach((clip, ri) => {
      const i = state.clips.length - 1 - ri;
      const div = document.createElement('div');
      div.className = 'clip';

      const num = document.createElement('span');
      num.textContent = '#' + (i + 1);
      div.appendChild(num);

      const times = document.createElement('span');
      times.className = 'times';
      times.textContent = formatTime(clip.start) + ' → ' + formatTime(clip.end);
      div.appendChild(times);

      const remove = document.createElement('span');
      remove.className = 'remove';
      remove.textContent = '✕';
      remove.onclick = () => { state.clips.splice(i, 1); updateUI(); };
      div.appendChild(remove);

      clipsEl.appendChild(div);
    });
    sendBtn.disabled = state.clips.length === 0;
  }

  function mark() {
    const video = getVideo();
    if (!video) { statusEl.textContent = 'No video found'; return; }
    const time = video.currentTime;

    if (state.currentStart === null) {
      state.currentStart = time;
      statusEl.textContent = 'Recording from ' + formatTime(time) + '...';
      statusEl.classList.add('recording');
    } else {
      if (time > state.currentStart) {
        state.clips.push({ start: state.currentStart, end: time });
        statusEl.textContent = 'Clip added: ' + formatTime(state.currentStart) + ' → ' + formatTime(time);
      } else {
        statusEl.textContent = 'End must be after start';
      }
      state.currentStart = null;
      statusEl.classList.remove('recording');
      updateUI();
    }
  }

  async function copyToClipboard() {
    if (state.clips.length === 0) return;

    const data = JSON.stringify({
      url: location.href,
      clips: state.clips
    });

    try {
      await navigator.clipboard.writeText(data);
      statusEl.textContent = 'Copied ' + state.clips.length + ' clips! Run: npm run clip';
      state.clips = [];
      updateUI();
    } catch (e) {
      statusEl.textContent = 'Failed to copy: ' + e.message;
    }
  }

  function toggle() {
    state.active = !state.active;
    ui.classList.toggle('hidden', !state.active);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'm') { e.preventDefault(); e.stopPropagation(); mark(); }
    else if (k === 'e') { e.preventDefault(); e.stopPropagation(); copyToClipboard(); }
    else if (k === 'h') { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);

  sendBtn.onclick = copyToClipboard;
  clearBtn.onclick = () => {
    state.clips = [];
    state.currentStart = null;
    statusEl.textContent = 'Cleared';
    statusEl.classList.remove('recording');
    updateUI();
  };

  window.derDieDeckMarker = { toggle };
})();
