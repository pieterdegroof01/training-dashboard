'use strict';
// Statische assertions op de landingspagina en het aanmeldscherm — leest
// enkel van schijf, requiret server.js niet (die start bij require een
// luisterende poort).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LANDING_HTML = fs.readFileSync(path.join(__dirname, '..', 'views', 'landing.html'), 'utf8');
const SIGNUP_HTML = fs.readFileSync(path.join(__dirname, '..', 'views', 'aanmelden.html'), 'utf8');

const H1_COPY = 'Je krachttraining telt niet mee in je vormcurve. Bij PeakForm <em>wel</em>.';

function countH1(html) {
  const matches = html.match(/<h1[\s>]/g);
  return matches ? matches.length : 0;
}

describe('views/landing.html', () => {
  test('precies één <h1>', () => {
    assert.strictEqual(countH1(LANDING_HTML), 1);
  });

  test('lang="nl" aanwezig', () => {
    assert.match(LANDING_HTML, /<html[^>]*\blang="nl"/);
  });

  test('de vier ankers zijn aanwezig', () => {
    for (const id of ['hoe-het-werkt', 'de-wetenschap', 'integraties', 'vragen']) {
      assert.match(LANDING_HTML, new RegExp(`id="${id}"`));
    }
  });

  test('exacte H1-copy uit SPEC.md § 5.2', () => {
    assert.ok(LANDING_HTML.includes(H1_COPY));
  });

  test('echt minteken U+2212 aanwezig in de TSB-cel', () => {
    const tsbMatch = LANDING_HTML.match(/<div class="stat-label">TSB<\/div>\s*<div class="stat-value">([^<]+)<\/div>/);
    assert.ok(tsbMatch, 'TSB-cel niet gevonden');
    assert.strictEqual(tsbMatch[1], '−4');
  });

  test('geen verwijzing naar css/style.css', () => {
    assert.ok(!LANDING_HTML.includes('css/style.css'));
  });

  test('geen <script src="http', () => {
    assert.ok(!LANDING_HTML.includes('<script src="http'));
  });

  test('koppenvolgorde: precies één h1, elke h3 staat na een h2', () => {
    const headings = [...LANDING_HTML.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
    assert.strictEqual(headings.filter(level => level === 1).length, 1);
    let seenH2 = false;
    for (const level of headings) {
      if (level === 2) seenH2 = true;
      if (level === 3) assert.ok(seenH2, 'h3 komt voor de eerste h2 in de documentvolgorde');
    }
  });

  test('#hoe-het-werkt en #de-wetenschap zijn geen lege stubs meer', () => {
    assert.ok(!LANDING_HTML.includes('<span id="hoe-het-werkt" class="section-stub"></span>'));
    assert.ok(!LANDING_HTML.includes('<span id="de-wetenschap" class="section-stub"></span>'));
  });

  test('beide diagram-viewBoxen komen exact één keer voor', () => {
    for (const viewBox of ['0 0 620 470', '0 0 300 440']) {
      const matches = LANDING_HTML.match(new RegExp(`viewBox="${viewBox}"`, 'g'));
      assert.strictEqual(matches ? matches.length : 0, 1, `viewBox="${viewBox}" niet exact één keer gevonden`);
    }
  });

  test('de zes metrieklabels komen elk exact één keer voor', () => {
    for (const label of ['Readiness', 'ATL CTL TSB', 'ACWR', 'Monotonie', 'Sessie van vandaag', 'Voeding en slaap']) {
      const matches = LANDING_HTML.match(new RegExp(`<div class="metric-label">${label}</div>`, 'g'));
      assert.strictEqual(matches ? matches.length : 0, 1, `metric-label "${label}" niet exact één keer gevonden`);
    }
  });

  test('echt minteken U+2212 in de ATL CTL TSB-metriekkaart', () => {
    const match = LANDING_HTML.match(/<div class="metric-label">ATL CTL TSB<\/div>\s*<div class="metric-value">([^<]+)<\/div>/);
    assert.ok(match, 'ATL CTL TSB-metriekkaart niet gevonden');
    assert.strictEqual(match[1], '−4');
  });

  test('geen href="#" en geen lege href', () => {
    assert.ok(!/href="#"/.test(LANDING_HTML), 'href="#" komt voor');
    assert.ok(!/href=""/.test(LANDING_HTML), 'lege href komt voor');
  });

  test('elke href="#..." verwijst naar een id dat in het bestand bestaat', () => {
    const ids = new Set([...LANDING_HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    const anchors = [...LANDING_HTML.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    assert.ok(anchors.length > 0, 'geen enkele href="#..." gevonden');
    for (const anchor of anchors) {
      assert.ok(ids.has(anchor), `href="#${anchor}" verwijst naar een niet-bestaand id`);
    }
  });

  test('precies vier FAQ-knoppen met aria-expanded, precies één op true', () => {
    const buttons = [...LANDING_HTML.matchAll(/<button class="faq-question"[^>]*aria-expanded="(true|false)"[^>]*>/g)];
    assert.strictEqual(buttons.length, 4);
    const openCount = buttons.filter(m => m[1] === 'true').length;
    assert.strictEqual(openCount, 1);
  });

  test('elk role="region" heeft een aria-labelledby dat naar een bestaand id wijst', () => {
    const ids = new Set([...LANDING_HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    const regions = [...LANDING_HTML.matchAll(/<div[^>]*role="region"[^>]*>/g)];
    assert.ok(regions.length > 0, 'geen enkele role="region" gevonden');
    for (const [tag] of regions) {
      const match = tag.match(/aria-labelledby="([^"]+)"/);
      assert.ok(match, `role="region" zonder aria-labelledby: ${tag}`);
      assert.ok(ids.has(match[1]), `aria-labelledby="${match[1]}" verwijst naar een niet-bestaand id`);
    }
  });

  test('robots-meta noindex, nofollow aanwezig', () => {
    assert.match(LANDING_HTML, /<meta name="robots" content="noindex, nofollow">/);
  });

  test('hallo@peakform.me komt niet voor', () => {
    assert.ok(!LANDING_HTML.includes('hallo@peakform.me'));
  });

  test('hamburger heeft aria-expanded', () => {
    assert.match(LANDING_HTML, /class="hamburger"[^>]*aria-expanded="(true|false)"/);
  });

  test('koppenvolgorde bevat geen overgeslagen niveau', () => {
    const headings = [...LANDING_HTML.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
    let maxSeen = 0;
    for (const level of headings) {
      assert.ok(level <= maxSeen + 1, `h${level} overslaat een niveau (hoogste tot dan: h${maxSeen})`);
      if (level > maxSeen) maxSeen = level;
    }
  });
});

describe('views/aanmelden.html', () => {
  test('precies één <h1>', () => {
    assert.strictEqual(countH1(SIGNUP_HTML), 1);
  });

  test('lang="nl" aanwezig', () => {
    assert.match(SIGNUP_HTML, /<html[^>]*\blang="nl"/);
  });

  test('geen verwijzing naar css/style.css', () => {
    assert.ok(!SIGNUP_HTML.includes('css/style.css'));
  });

  test('geen <script src="http', () => {
    assert.ok(!SIGNUP_HTML.includes('<script src="http'));
  });

  test('robots-meta noindex, nofollow aanwezig', () => {
    assert.match(SIGNUP_HTML, /<meta name="robots" content="noindex, nofollow">/);
  });

  test('hallo@peakform.me komt niet voor', () => {
    assert.ok(!SIGNUP_HTML.includes('hallo@peakform.me'));
  });

  test('geen mailto-link', () => {
    assert.ok(!SIGNUP_HTML.includes('mailto:'));
  });
});
