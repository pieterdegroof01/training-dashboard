'use strict';
// availability.js — Pure adapter tussen het oude week_availability-JSONB-formaat
// en het nieuwe tweetraps availability_slots-formaat. Geen I/O, geen require van
// pg/db, analoog aan de pure laag in planner.js.

// legacyToSlots({ '2026-07-09': { cycling: true, maxDuration: 90 }, ... })
//   → [{ slot_date, minutes, modalities: ['cycling'], time_of_day: null, source: 'legacy' }, ...]
// Dagen zonder truthy modaliteit (bv. cycling: false) worden overgeslagen.
function legacyToSlots(weekAvailability) {
  const slots = [];
  for (const [date, v] of Object.entries(weekAvailability || {})) {
    if (!v || !v.cycling) continue;
    slots.push({
      slot_date: date,
      minutes: v.maxDuration || 90,
      modalities: ['cycling'],
      time_of_day: null,
      source: 'legacy',
    });
  }
  return slots.sort((a, b) => a.slot_date.localeCompare(b.slot_date));
}

// slotsToLegacyDay([{ minutes, modalities }, ...]) → { cycling: true, maxDuration } | null
// Neemt de slots van één dag. Bij meerdere cycling-slots wint de hoogste minutes.
// Geen cycling-slot → null (dag hoort uit week_availability verwijderd te worden).
function slotsToLegacyDay(slots) {
  const cyclingSlots = (slots || []).filter(s => (s.modalities || []).includes('cycling'));
  if (!cyclingSlots.length) return null;
  const maxDuration = Math.max(...cyclingSlots.map(s => s.minutes));
  return { cycling: true, maxDuration };
}

// toISODate(v): normaliseert een slot_date-waarde naar 'YYYY-MM-DD'.
// pg geeft een DATE-kolom terug als lokale-middernacht-Date. GEEN toISOString()
// gebruiken: dat converteert naar UTC en zou in een positieve UTC-offset
// (bv. Europe/Amsterdam) de datum een dag terugschuiven. Daarom bouwen we de
// string uit de lokale componenten.
function toISODate(v) {
  if (typeof v === 'string') return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
}

// mergeAvailabilityView(dbSlots, weekAvailability, from, to)
//   → union van availability_slots en de legacy-spiegel, gededupliceerd per dag
//   (dbSlots winnen), gesorteerd op datum. Pure variant van de leesadapter-union
//   in GET /api/availability-slots.
function mergeAvailabilityView(dbSlots, weekAvailability, from, to) {
  const normalized = (dbSlots || []).map(s => ({ ...s, slot_date: toISODate(s.slot_date) }));
  const seenDates = new Set(normalized.map(s => s.slot_date));
  const legacySlots = legacyToSlots(weekAvailability)
    .filter(s => s.slot_date >= from && s.slot_date <= to && !seenDates.has(s.slot_date));

  const all = [...normalized, ...legacySlots];
  all.sort((a, b) => a.slot_date.localeCompare(b.slot_date));
  return all;
}

module.exports = { legacyToSlots, slotsToLegacyDay, toISODate, mergeAvailabilityView };
