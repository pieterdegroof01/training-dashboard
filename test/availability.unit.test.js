'use strict';
// Pure adapter tests — geen pg-require, draait geïsoleerd met
// node --test test/availability.unit.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { legacyToSlots, slotsToLegacyDay } = require('../availability');

describe('legacyToSlots', () => {
  test('dag met cycling+maxDuration wordt één slot met die minuten', () => {
    const slots = legacyToSlots({ '2026-07-09': { cycling: true, maxDuration: 120 } });
    assert.strictEqual(slots.length, 1);
    assert.strictEqual(slots[0].slot_date, '2026-07-09');
    assert.strictEqual(slots[0].minutes, 120);
    assert.deepStrictEqual(slots[0].modalities, ['cycling']);
    assert.strictEqual(slots[0].source, 'legacy');
  });

  test('ontbrekende maxDuration valt terug op 90', () => {
    const slots = legacyToSlots({ '2026-01-14': { cycling: true } });
    assert.strictEqual(slots[0].minutes, 90);
  });

  test('cycling:false wordt overgeslagen', () => {
    const slots = legacyToSlots({ '2026-07-09': { cycling: false, maxDuration: 90 } });
    assert.strictEqual(slots.length, 0);
  });

  test('output is gesorteerd op datum (zomer en winter)', () => {
    const slots = legacyToSlots({
      '2026-07-09': { cycling: true, maxDuration: 90 },
      '2026-01-14': { cycling: true, maxDuration: 60 },
    });
    assert.deepStrictEqual(slots.map(s => s.slot_date), ['2026-01-14', '2026-07-09']);
  });
});

describe('slotsToLegacyDay', () => {
  test('cycling-slot van 120 min geeft { cycling: true, maxDuration: 120 }', () => {
    const day = slotsToLegacyDay([{ minutes: 120, modalities: ['cycling'] }]);
    assert.deepStrictEqual(day, { cycling: true, maxDuration: 120 });
  });

  test('bij meerdere cycling-slots wint de hoogste minutes', () => {
    const day = slotsToLegacyDay([
      { minutes: 60, modalities: ['cycling'] },
      { minutes: 90, modalities: ['cycling'] },
    ]);
    assert.strictEqual(day.maxDuration, 90);
  });

  test('slots zonder cycling geven null', () => {
    const day = slotsToLegacyDay([{ minutes: 45, modalities: ['gym'] }]);
    assert.strictEqual(day, null);
  });
});

describe('round-trip legacyToSlots → slotsToLegacyDay', () => {
  const cases = [
    { date: '2026-07-09', maxDuration: 90 },   // zomerdatum
    { date: '2026-01-14', maxDuration: 60 },   // winterdatum
  ];

  for (const { date, maxDuration } of cases) {
    test(`${date}: reproduceert cycling+maxDuration`, () => {
      const legacy = { [date]: { cycling: true, maxDuration } };
      const slots = legacyToSlots(legacy);
      const daySlots = slots.filter(s => s.slot_date === date);
      const mirrored = slotsToLegacyDay(daySlots);
      assert.deepStrictEqual(mirrored, legacy[date]);
    });
  }
});
