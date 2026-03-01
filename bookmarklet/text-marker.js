// yt2anki Text Marker
// Select German text on any webpage, press T to copy for card creation

(function() {
  const selection = window.getSelection().toString().trim();

  if (!selection) {
    alert('yt2anki: Select some German text first');
    return;
  }

  const data = JSON.stringify({
    type: 'text',
    german: selection,
    source: location.href
  });

  navigator.clipboard.writeText(data).then(() => {
    alert('yt2anki: Copied "' + selection.slice(0, 50) + (selection.length > 50 ? '...' : '') + '"\n\nRun: npm start');
  }).catch(err => {
    alert('yt2anki: Failed to copy - ' + err.message);
  });
})();
