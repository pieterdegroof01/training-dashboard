'use strict';
// Tests voor het beheerscherm (L7a) — leest van schijf, requiret server.js
// niet (die start bij require een luisterende poort). csv.js is puur en mag
// wel gerequired worden.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { toCsv, escapeCell } = require('../csv');

const ADMIN_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
const SERVER_JS = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function countH1(html) {
  const matches = html.match(/<h1[\s>]/g);
  return matches ? matches.length : 0;
}

describe('csv.js: escapeCell', () => {
  test('verdubbelt dubbele quotes en omsluit met quotes', () => {
    assert.strictEqual(escapeCell('a"b'), '"a""b"');
  });

  test('komma in de cel wordt omsloten door dubbele quotes', () => {
    assert.strictEqual(escapeCell('a,b'), '"a,b"');
  });

  test('regeleinde in de cel wordt omsloten door dubbele quotes', () => {
    assert.strictEqual(escapeCell('a\nb'), '"a\nb"');
  });

  test('null wordt een lege string', () => {
    assert.strictEqual(escapeCell(null), '');
  });

  test('undefined wordt een lege string', () => {
    assert.strictEqual(escapeCell(undefined), '');
  });

  test('een waarde die begint met = krijgt een voorafgaand apostrof', () => {
    assert.strictEqual(escapeCell('=SOM(A1)'), "'=SOM(A1)");
  });
});

describe('csv.js: toCsv', () => {
  test('zet de labels als eerste regel', () => {
    const csv = toCsv([{ a: '1' }], [{ key: 'a', label: 'Kolom A' }]);
    const firstLine = csv.split('\r\n')[0];
    assert.strictEqual(firstLine, 'Kolom A');
  });

  test('gebruikt CRLF als regeleinde', () => {
    const csv = toCsv([{ a: '1' }], [{ key: 'a', label: 'A' }]);
    assert.match(csv, /\r\n/);
  });
});

describe('public/admin.html', () => {
  test('precies één <h1>', () => {
    assert.strictEqual(countH1(ADMIN_HTML), 1);
  });

  test('lang="nl" aanwezig', () => {
    assert.match(ADMIN_HTML, /<html[^>]*\blang="nl"/);
  });

  test('robots-meta noindex, nofollow aanwezig', () => {
    assert.match(ADMIN_HTML, /<meta name="robots" content="noindex, nofollow">/);
  });

  test('tokens.css is gelinkt', () => {
    assert.match(ADMIN_HTML, /<link rel="stylesheet" href="\/css\/tokens\.css">/);
  });

  test('geen innerHTML-toekenning', () => {
    const matches = ADMIN_HTML.match(/innerHTML\s*=/g);
    assert.strictEqual(matches ? matches.length : 0, 0);
  });
});

describe('server.js: AUTH_EXCLUDED regressiegard', () => {
  test('geen enkel /api/admin-pad staat in AUTH_EXCLUDED', () => {
    const match = SERVER_JS.match(/const AUTH_EXCLUDED\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(match, 'AUTH_EXCLUDED-array-literal niet gevonden in server.js');
    const literal = match[1];
    const paths = [...literal.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    assert.ok(paths.length > 0, 'geen paden gevonden in AUTH_EXCLUDED');
    for (const p of paths) {
      assert.ok(!p.startsWith('/api/admin'), `AUTH_EXCLUDED bevat een /api/admin-pad: ${p}`);
    }
  });
});

describe('server.js: GET /api/admin/integraties roept getStravaToken niet aan', () => {
  test('het handlerblok bevat de string getStravaToken( niet', () => {
    const match = SERVER_JS.match(/^app\.get\('\/api\/admin\/integraties'[\s\S]*?\n\}\);/m);
    assert.ok(match, "handlerblok voor GET /api/admin/integraties niet gevonden in server.js");
    const handlerBlock = match[0];
    assert.ok(!handlerBlock.includes('getStravaToken('), 'handlerblok roept getStravaToken( aan; een leesendpoint mag geen tokenrefresh uitlokken');
  });
});
