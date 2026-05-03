const STYLE_START = '/* DerDieDeck shared styles start */';
const STYLE_END = '/* DerDieDeck shared styles end */';

export const DERDIEDECK_STYLE_MARKERS = {
  start: STYLE_START,
  end: STYLE_END,
};

export const DERDIEDECK_SHARED_CSS = `${STYLE_START}
:root {
  --ddd-text: #111827;
  --ddd-muted: #475569;
  --ddd-divider: rgba(15, 23, 42, 0.42);
  --ddd-panel: rgba(148, 163, 184, 0.12);
  --ddd-ipa: #475569;
  --ddd-focus-label: #64748b;
  --ddd-masculine: #2563eb;
  --ddd-feminine: #dc2626;
  --ddd-neuter: #0f766e;
}

.card {
  color: var(--ddd-text);
}

.yt2anki-ipa {
  color: var(--yt2anki-ipa, var(--ddd-ipa));
  font-size: 0.92em;
  font-style: italic;
  line-height: 1.28;
}

.yt2anki-gender-masculine {
  color: var(--yt2anki-gender-masculine, var(--ddd-masculine));
}

.yt2anki-gender-feminine {
  color: var(--yt2anki-gender-feminine, var(--ddd-feminine));
}

.yt2anki-gender-neuter {
  color: var(--yt2anki-gender-neuter, var(--ddd-neuter));
}

.yt2anki-front-context {
  background: var(--ddd-panel);
  color: var(--ddd-muted);
}

.ddd-focus {
  background: var(--ddd-panel);
  color: var(--ddd-muted);
}

.ddd-answer-stack {
  color: var(--ddd-text);
}

.ddd-answer-ipa .yt2anki-ipa {
  display: inline-block;
  max-width: 100%;
}

.ddd-answer-extra {
  color: var(--ddd-text);
}

.ddd-image img {
  max-width: 100%;
  height: auto;
}

.yt2anki-word-contrast {
  color: var(--ddd-neuter);
}

.nightMode,
.night_mode {
  --ddd-text: #f8fafc;
  --ddd-muted: #cbd5e1;
  --ddd-divider: rgba(226, 232, 240, 0.48);
  --ddd-panel: rgba(148, 163, 184, 0.16);
  --ddd-ipa: #cbd5e1;
}

.mobile .yt2anki-ipa,
.iphone .yt2anki-ipa,
.ipad .yt2anki-ipa,
.android .yt2anki-ipa {
  font-size: 0.86em;
  line-height: 1.22;
}
${STYLE_END}`;

export function mergeDerDieDeckStyles(existingCss = '') {
  const css = String(existingCss || '');
  const startIndex = css.indexOf(STYLE_START);
  const endIndex = css.indexOf(STYLE_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = css.slice(0, startIndex).trimEnd();
    const after = css.slice(endIndex + STYLE_END.length).trimStart();
    return [before, DERDIEDECK_SHARED_CSS, after].filter(Boolean).join('\n\n');
  }

  return [css.trimEnd(), DERDIEDECK_SHARED_CSS].filter(Boolean).join('\n\n');
}

export function hasCurrentDerDieDeckStyles(existingCss = '') {
  return String(existingCss || '').includes(DERDIEDECK_SHARED_CSS);
}
