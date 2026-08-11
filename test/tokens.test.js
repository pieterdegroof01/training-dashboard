'use strict';
// Statische assertions op de tokenextractie (U2b): leest enkel van schijf,
// requiret server.js niet (die start bij require een luisterende poort).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const TOKENS_CSS = read('public', 'css', 'tokens.css');
const STYLE_CSS = read('public', 'css', 'style.css');
const LANDING_CSS = read('public', 'css', 'landing.css');

function tokenNames(css) {
  return [...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(m => m[1]);
}

function topLevelBlock(css, selectorRegex) {
  const match = css.match(selectorRegex);
  return match ? match[1] : null;
}

describe('public/css/tokens.css', () => {
  test('bestaat en bevat zowel een :root- als een [data-theme="dark"]-blok', () => {
    assert.match(TOKENS_CSS, /:root\s*\{/);
    assert.match(TOKENS_CSS, /\[data-theme="dark"\]\s*\{/);
  });

  test('bevat minstens de kerntokens die style.css en landing.css delen', () => {
    for (const name of ['--bg', '--surface', '--text', '--muted', '--accent', '--accent2', '--border']) {
      assert.ok(tokenNames(TOKENS_CSS).includes(name), `${name} ontbreekt in tokens.css`);
    }
  });
});

describe('style.css bevat geen custom-property-definities meer', () => {
  test('geen enkele --naam: declaratie', () => {
    assert.strictEqual(tokenNames(STYLE_CSS).length, 0, `nog gevonden: ${tokenNames(STYLE_CSS).join(', ')}`);
  });
});

describe('landing.css herdefinieert geen enkel token dat al in tokens.css staat', () => {
  test('het :root, [data-theme="light"]-blok bevat geen tokens.css-namen', () => {
    const block = topLevelBlock(LANDING_CSS, /:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/);
    assert.ok(block, 'het gedeelde :root-blok is niet gevonden in landing.css');
    const tokensCssNames = new Set(tokenNames(TOKENS_CSS));
    for (const name of tokenNames(block)) {
      assert.ok(!tokensCssNames.has(name), `--${name.slice(2)} staat zowel in tokens.css als in landing.css's :root-blok`);
    }
  });

  test('het [data-theme="dark"]-blok bevat geen tokens.css-namen', () => {
    const block = topLevelBlock(LANDING_CSS, /\[data-theme="dark"\]\s*\{([^}]*)\}/);
    assert.ok(block, 'het dark-blok is niet gevonden in landing.css');
    const tokensCssNames = new Set(tokenNames(TOKENS_CSS));
    for (const name of tokenNames(block)) {
      assert.ok(!tokensCssNames.has(name), `--${name.slice(2)} staat zowel in tokens.css als in landing.css's dark-blok`);
    }
  });
});

describe('elke var(--x)-referentie is ergens gedefinieerd', () => {
  // --pill-color wordt per element runtime gezet via style="--pill-color:..."
  // in app.js, nooit in CSS — geen tokenreferentie. --fg is een pre-existing
  // dode referentie (public/css/style.css, .pf-info-tip), buiten scope van
  // de U2b-tokenextractie; gerapporteerd, niet hier stilzwijgend "opgelost".
  const KNOWN_UNRESOLVED = new Set(['--pill-color', '--fg']);

  function assertNoUndefinedVars(label, css) {
    const defined = new Set([...tokenNames(TOKENS_CSS), ...tokenNames(css)]);
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)[,)]/g)].map(m => m[1]));
    for (const name of used) {
      if (KNOWN_UNRESOLVED.has(name)) continue;
      assert.ok(defined.has(name), `${label}: var(${name}) verwijst naar een token dat nergens gedefinieerd is`);
    }
  }

  test('landing.css', () => assertNoUndefinedVars('landing.css', LANDING_CSS));
  test('style.css', () => assertNoUndefinedVars('style.css', STYLE_CSS));
});

describe('cascade-volgorde: tokens.css laadt vóór de andere stylesheet', () => {
  const cases = [
    { file: 'public/index.html', other: /\/css\/style\.css/ },
    { file: 'public/404.html', other: /\/css\/style\.css/ },
    { file: 'views/landing.html', other: /\/css\/landing\.css/ },
    { file: 'views/aanmelden.html', other: /\/css\/landing\.css/ },
    { file: 'public/login.html', other: /<style>/ },
  ];

  for (const { file, other } of cases) {
    test(file, () => {
      const html = read(...file.split('/'));
      const tokensIdx = html.search(/\/css\/tokens\.css/);
      const otherIdx = html.search(other);
      assert.ok(tokensIdx !== -1, `${file}: geen link naar /css/tokens.css gevonden`);
      assert.ok(otherIdx !== -1, `${file}: andere stylesheet-referentie niet gevonden`);
      assert.ok(tokensIdx < otherIdx, `${file}: tokens.css laadt niet vóór de andere stylesheet`);
    });
  }
});
