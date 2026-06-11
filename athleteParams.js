// athleteParams.js
// Leeskant van de learning-ready planner. Geeft de atleet-variabele knoppen terug die
// de planner consumeert. Vandaag: populatie-priors uit de spec. Zodra de leerlaag (Laag 4)
// athlete_model_params vult, mengt deze module geleerde waarden eroverheen met shrinkage
// richting de prior op basis van sample_size. Geen knop wordt in de planner gehardcodeerd.
const { getLearnedParams } = require('./db');

// Atleet-variabele scalars die de leerlaag personaliseert. Universele constanten
// (zoneverdelingen, taperpercentages) horen NIET hier maar in de planner zelf.
const POPULATION_PRIORS = {
  rampCapCtlPerWeek: 6,
  loadWeeksBeforeRecovery: 3,
  ctlTimeConstantDays: 42,
  atlTimeConstantDays: 7,
  minTsbForQuality: -25,
  interferenceFactor: 1.0,
  maxHitSessionsPerWeek: 3,
  minHoursBetweenHit: 48,
  distributionPolarizedMinHours: 8,
  distributionPyramidalMinHours: 6,
};

// Shrinkage: blended = prior + (learned - prior) * w, met w = n / (n + K).
// Bij n = 0 -> w = 0 -> exact de prior. K conservatief gekozen.
const SHRINKAGE_K = 10;

async function getAthleteParams(userId) {
  const priors = { ...POPULATION_PRIORS };
  let learned = null;
  try { learned = await getLearnedParams(userId); } catch (e) { learned = null; }
  if (!learned || !learned.params || learned.sample_size <= 0) {
    return { ...priors, paramSource: 'population_prior' };
  }
  const n = learned.sample_size;
  const w = n / (n + SHRINKAGE_K);
  const out = { ...priors };
  for (const key of Object.keys(priors)) {
    const lv = learned.params[key];
    if (typeof lv === 'number' && typeof priors[key] === 'number') {
      out[key] = priors[key] + (lv - priors[key]) * w;
    }
  }
  out.paramSource = 'learned';
  out.shrinkageWeight = w;
  return out;
}

module.exports = { getAthleteParams, POPULATION_PRIORS };
