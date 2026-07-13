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

module.exports = { legacyToSlots, slotsToLegacyDay };
