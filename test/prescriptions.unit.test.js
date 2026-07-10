'use strict';
// replaceActivePrescriptions draait tegen een gemockte pg-client (pool.connect()).
// DATABASE_URL moet gezet zijn VOORDAT db.js wordt gerequired, anders blijft de
// interne pool-variabele null en faalt de functie meteen met "geen pool".
process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');

// Classificeert een SQL-statement naar het statement-type dat replaceActivePrescriptions
// eronder verstuurt, zodat tests op volgorde en aantal kunnen asserten zonder de
// exacte SQL-tekst te dupliceren.
function classify(sql) {
  const s = sql.trim();
  if (s === 'BEGIN') return 'BEGIN';
  if (s === 'COMMIT') return 'COMMIT';
  if (s === 'ROLLBACK') return 'ROLLBACK';
  if (sql.includes('FOR UPDATE')) return 'SELECT_FOR_UPDATE';
  if (sql.includes("SET status = 'superseded'")) return 'UPDATE_SUPERSEDE';
  if (sql.includes('INSERT INTO training_prescriptions')) return 'INSERT';
  if (sql.includes('SET superseded_by')) return 'UPDATE_SUPERSEDED_BY';
  throw new Error(`onbekend statement in test-mock: ${sql}`);
}

// Bouwt een mock-client die calls bijhoudt en oldRows teruggeeft voor de
// SELECT ... FOR UPDATE. insertImpl kan het standaard insert-gedrag overschrijven
// (bv. om een unique violation te simuleren).
function makeMockClient({ oldRows = [], insertImpl } = {}) {
  const calls = [];
  let nextId = 100;
  const client = {
    query: async (sql, params) => {
      const kind = classify(sql);
      calls.push({ kind, sql, params });
      if (kind === 'SELECT_FOR_UPDATE') return { rows: oldRows };
      if (kind === 'INSERT') {
        if (insertImpl) return insertImpl(params);
        return { rows: [{ id: nextId++ }] };
      }
      return {};
    },
    release: () => {},
  };
  return { client, calls };
}

function withMockPool(client, fn) {
  const original = db.pool.connect;
  db.pool.connect = async () => client;
  return fn().finally(() => { db.pool.connect = original; });
}

describe('replaceActivePrescriptions', () => {
  test('supersedeert eerst en voegt daarna pas in (BEGIN, SELECT FOR UPDATE, UPDATE superseded, INSERT, COMMIT)', async () => {
    const oldRows = [{ id: 1, prescribed_date: '2026-01-05', modality: 'cycling' }];
    const { client, calls } = makeMockClient({ oldRows });

    await withMockPool(client, () => db.replaceActivePrescriptions(
      42,
      [{ prescribed_date: '2026-01-05', modality: 'cycling' }],
      '2026-01-05', '2026-01-11',
      { plan_run_id: 'run-1', planner_params: null }
    ));

    const kinds = calls.map(c => c.kind);
    const idx = k => kinds.indexOf(k);
    assert.equal(kinds[0], 'BEGIN');
    assert.equal(kinds[kinds.length - 1], 'COMMIT');
    assert.ok(idx('SELECT_FOR_UPDATE') > idx('BEGIN'));
    assert.ok(idx('UPDATE_SUPERSEDE') > idx('SELECT_FOR_UPDATE'));
    assert.ok(idx('INSERT') > idx('UPDATE_SUPERSEDE'));
    assert.ok(idx('COMMIT') > idx('INSERT'));
  });

  test('geen UPDATE ... superseded bij nul bestaande actieve voorschriften', async () => {
    const { client, calls } = makeMockClient({ oldRows: [] });

    await withMockPool(client, () => db.replaceActivePrescriptions(
      42,
      [{ prescribed_date: '2026-01-05', modality: 'cycling' }],
      '2026-01-05', '2026-01-11',
      { plan_run_id: 'run-1', planner_params: null }
    ));

    const kinds = calls.map(c => c.kind);
    assert.ok(!kinds.includes('UPDATE_SUPERSEDE'));
  });

  test('superseded_by koppelt op datum + modaliteit, niet op volgorde', async () => {
    // Bewust in andere volgorde dan de nieuwe prescriptions, om te bewijzen dat
    // matching niet op array-positie leunt.
    const oldRows = [
      { id: 10, prescribed_date: '2026-01-06', modality: 'running' },
      { id: 11, prescribed_date: '2026-01-05', modality: 'cycling' },
    ];
    const { client, calls } = makeMockClient({ oldRows });

    await withMockPool(client, () => db.replaceActivePrescriptions(
      42,
      [
        { prescribed_date: '2026-01-05', modality: 'cycling' },  // wordt id 100
        { prescribed_date: '2026-01-06', modality: 'running' },  // wordt id 101
      ],
      '2026-01-05', '2026-01-11',
      { plan_run_id: 'run-1', planner_params: null }
    ));

    const links = calls
      .filter(c => c.kind === 'UPDATE_SUPERSEDED_BY')
      .map(c => c.params);

    assert.deepEqual(links.find(([oldId]) => oldId === 11), [11, 100]);
    assert.deepEqual(links.find(([oldId]) => oldId === 10), [10, 101]);
  });

  test('fout tijdens INSERT leidt tot ROLLBACK en de fout wordt doorgegooid', async () => {
    const insertError = new Error('duplicate key value violates unique constraint "uniq_presc_active"');
    const { client, calls } = makeMockClient({
      oldRows: [],
      insertImpl: () => { throw insertError; },
    });

    await assert.rejects(
      () => withMockPool(client, () => db.replaceActivePrescriptions(
        42,
        [{ prescribed_date: '2026-01-05', modality: 'cycling' }],
        '2026-01-05', '2026-01-11',
        { plan_run_id: 'run-1', planner_params: null }
      )),
      err => err === insertError
    );

    const kinds = calls.map(c => c.kind);
    assert.equal(kinds[kinds.length - 1], 'ROLLBACK');
    assert.ok(!kinds.includes('COMMIT'));
  });

  test('modality valt terug op "cycling" zonder modality-veld', async () => {
    const { client, calls } = makeMockClient({ oldRows: [] });

    await withMockPool(client, () => db.replaceActivePrescriptions(
      42,
      [{ prescribed_date: '2026-01-05' }],  // geen modality
      '2026-01-05', '2026-01-11',
      { plan_run_id: 'run-1', planner_params: null }
    ));

    const insertCall = calls.find(c => c.kind === 'INSERT');
    assert.equal(insertCall.params[3], 'cycling');
  });
});
