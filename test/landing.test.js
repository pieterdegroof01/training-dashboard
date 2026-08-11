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
});
