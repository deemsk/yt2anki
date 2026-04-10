// DerDieDeck Text Marker
// Select German text on any webpage, press T to copy for card creation

(function() {
  const selection = window.getSelection().toString().trim();

  if (!selection) {
    alert('DerDieDeck: Select some German text first');
    return;
  }

  const data = JSON.stringify({
    type: 'text',
    german: selection,
    source: location.href
  });

  navigator.clipboard.writeText(data).then(() => {
    alert('DerDieDeck: Copied "' + selection.slice(0, 50) + (selection.length > 50 ? '...' : '') + '"\n\nRun: npm start');
  }).catch(err => {
    alert('DerDieDeck: Failed to copy - ' + err.message);
  });
})();
