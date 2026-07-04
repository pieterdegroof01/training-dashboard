'use strict';

const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  const isInternal = process.env.DATABASE_URL.includes('railway.internal');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isInternal ? false : { rejectUnauthorized: false },
  });
}

async function query(text, params) {
  return pool.query(text, params);
}

async function initSchema() {
  if (!pool) {
    console.warn('DB: geen DATABASE_URL geconfigureerd — schema-initialisatie overgeslagen');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id               BIGSERIAL PRIMARY KEY,
      username         TEXT UNIQUE NOT NULL,
      password_hash    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      goals            JSONB NOT NULL DEFAULT '{}'::jsonb,
      patterns         JSONB NOT NULL DEFAULT '[]'::jsonb,
      settings         JSONB NOT NULL DEFAULT '{}'::jsonb,
      week_plan        JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_insights      JSONB NOT NULL DEFAULT '{}'::jsonb,
      week_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
      calibration      JSONB NOT NULL DEFAULT '{}'::jsonb,
      literature       JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS literature JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_skeleton JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cp_model JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS activities (
      user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      strava_id               BIGINT NOT NULL,
      start_date              TIMESTAMPTZ,
      type                    TEXT,
      moving_time             INTEGER,
      average_watts           REAL,
      weighted_average_watts  REAL,
      suffer_score            REAL,
      device_watts            BOOLEAN,
      power_source            TEXT,
      tss                     REAL,
      tss_source              TEXT,
      raw                     JSONB,
      mmp                     JSONB,
      streams                 JSONB,
      PRIMARY KEY (user_id, strava_id)
    );

    CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities (user_id, start_date);
    CREATE INDEX IF NOT EXISTS idx_activities_user_type ON activities (user_id, type);

    CREATE TABLE IF NOT EXISTS weights (
      user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date      DATE NOT NULL,
      weight_kg NUMERIC(5,1),
      source    TEXT,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS sleep (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date    DATE NOT NULL,
      hours   NUMERIC(4,2),
      quality SMALLINT,
      source  TEXT,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS nutrition (
      user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date      DATE NOT NULL,
      kcal      INTEGER,
      protein_g NUMERIC(6,1),
      carbs_g   NUMERIC(6,1),
      fat_g     NUMERIC(6,1),
      raw       JSONB,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS hevy_workouts (
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hevy_id    TEXT NOT NULL,
      start_date TIMESTAMPTZ,
      raw        JSONB,
      PRIMARY KEY (user_id, hevy_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hevy_user_date ON hevy_workouts (user_id, start_date);

    CREATE TABLE IF NOT EXISTS exercise_templates (
      user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id             TEXT NOT NULL,
      title                   TEXT,
      primary_muscle_group    TEXT,
      secondary_muscle_groups JSONB,
      type                    TEXT,
      is_custom               BOOLEAN,
      raw                     JSONB,
      fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, template_id)
    );

    CREATE TABLE IF NOT EXISTS activity_streams (
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      strava_id  TEXT NOT NULL,
      cached_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      raw        JSONB NOT NULL,
      PRIMARY KEY (user_id, strava_id)
    );

    CREATE INDEX IF NOT EXISTS idx_streams_user_cached ON activity_streams (user_id, cached_at);

    CREATE TABLE IF NOT EXISTS training_prescriptions (
      id                  BIGSERIAL PRIMARY KEY,
      user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prescribed_date     DATE NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      plan_run_id         TEXT NOT NULL,
      session_type        TEXT,
      target_duration_min INTEGER,
      target_tss          REAL,
      target_if           REAL,
      blocks              JSONB,
      mesocycle           JSONB,
      distribution_model  TEXT,
      planner_params      JSONB,
      rationale           TEXT,
      status              TEXT NOT NULL DEFAULT 'active',
      superseded_by       BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_presc_user_date   ON training_prescriptions (user_id, prescribed_date);
    CREATE INDEX IF NOT EXISTS idx_presc_user_status ON training_prescriptions (user_id, status);

    CREATE TABLE IF NOT EXISTS session_outcomes (
      id                  BIGSERIAL PRIMARY KEY,
      user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prescription_id     BIGINT,
      strava_id           BIGINT,
      outcome_date        DATE NOT NULL,
      match_type          TEXT NOT NULL,
      match_confidence    REAL,
      actual_duration_min INTEGER,
      actual_tss          REAL,
      actual_if           REAL,
      actual_avg_power    REAL,
      deltas              JSONB,
      execution_quality   REAL,
      pre_session_state   JSONB,
      response_markers    JSONB,
      reconciled_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_outcome_presc ON session_outcomes (user_id, prescription_id) WHERE prescription_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_outcome_act   ON session_outcomes (user_id, strava_id)       WHERE strava_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS athlete_model_params (
      user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      params      JSONB NOT NULL DEFAULT '{}'::jsonb,
      sample_size INTEGER NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const ALLOWED_USER_FIELDS = new Set([
  'goals', 'patterns', 'settings', 'week_plan',
  'ai_insights', 'week_availability', 'calibration', 'literature', 'plan_skeleton',
  'cp_model',
]);

async function getUser(username) {
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
  return rows[0] || null;
}

async function saveUserFields(userId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  for (const key of keys) {
    if (!ALLOWED_USER_FIELDS.has(key)) {
      throw new Error(`saveUserFields: onbekende kolom '${key}'`);
    }
  }
  const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
  const values = keys.map(key => JSON.stringify(fields[key]));
  values.push(userId);
  await query(`UPDATE users SET ${setClauses} WHERE id = $${keys.length + 1}`, values);
  _defaultUser = null;
}

async function getActivities(userId) {
  const { rows } = await query(
    'SELECT * FROM activities WHERE user_id = $1 ORDER BY start_date ASC',
    [userId]
  );
  return rows.map(row => {
    const base = { ...(row.raw || {}), id: Number(row.strava_id) };
    if (row.tss !== null) base.tss = row.tss;
    if (row.tss_source !== null) base.tss_source = row.tss_source;
    if (row.mmp !== null) base.mmp = row.mmp;
    if (row.streams !== null) base.streams = row.streams;
    return base;
  });
}

// Zelfde vorm als getActivities maar zonder de streams-kolom. streams bevat de
// per-seconde reeksen en is veruit de grootste kolom; analytics-endpoints
// (trends, power-profile, mmp-curve, charts/data) gebruiken die nooit. Door de
// kolom niet te selecteren vervalt het transporteren en deserialiseren van de
// zware JSONB per request. Nooit gebruiken voor activity-detail; dat heeft
// streams wel nodig.
async function getActivitiesLite(userId) {
  const { rows } = await query(
    `SELECT user_id, strava_id, start_date, type, moving_time,
            average_watts, weighted_average_watts, suffer_score,
            device_watts, power_source, tss, tss_source, raw, mmp
       FROM activities WHERE user_id = $1 ORDER BY start_date ASC`,
    [userId]
  );
  return rows.map(row => {
    const base = { ...(row.raw || {}), id: Number(row.strava_id) };
    if (row.tss !== null) base.tss = row.tss;
    if (row.tss_source !== null) base.tss_source = row.tss_source;
    if (row.mmp !== null) base.mmp = row.mmp;
    return base;
  });
}

async function upsertActivity(userId, activity) {
  await query(
    `INSERT INTO activities (
      user_id, strava_id, start_date, type, moving_time,
      average_watts, weighted_average_watts, suffer_score,
      device_watts, power_source, tss, tss_source, raw, mmp, streams
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (user_id, strava_id) DO UPDATE SET
      start_date             = EXCLUDED.start_date,
      type                   = EXCLUDED.type,
      moving_time            = EXCLUDED.moving_time,
      average_watts          = EXCLUDED.average_watts,
      weighted_average_watts = EXCLUDED.weighted_average_watts,
      suffer_score           = EXCLUDED.suffer_score,
      device_watts           = EXCLUDED.device_watts,
      power_source           = EXCLUDED.power_source,
      tss                    = EXCLUDED.tss,
      tss_source             = EXCLUDED.tss_source,
      raw                    = EXCLUDED.raw,
      mmp                    = EXCLUDED.mmp,
      streams                = EXCLUDED.streams`,
    [
      userId,
      activity.id,
      activity.start_date,
      activity.type,
      activity.moving_time,
      activity.average_watts,
      activity.weighted_average_watts,
      activity.suffer_score,
      activity.device_watts,
      activity.power_source,
      activity.tss,
      activity.tss_source,
      JSON.stringify(activity),
      activity.mmp != null ? JSON.stringify(activity.mmp) : null,
      activity.streams != null ? JSON.stringify(activity.streams) : null,
    ]
  );
}

async function getWeights(userId) {
  const { rows } = await query(
    'SELECT date, weight_kg, source FROM weights WHERE user_id = $1 ORDER BY date ASC',
    [userId]
  );
  return rows.map(row => ({
    date: row.date,
    weight_kg: Number(row.weight_kg),
    source: row.source,
  }));
}

async function upsertWeight(userId, date, kg, source = 'manual') {
  await query(
    `INSERT INTO weights (user_id, date, weight_kg, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date) DO UPDATE SET
       weight_kg = EXCLUDED.weight_kg,
       source    = EXCLUDED.source`,
    [userId, date, kg, source]
  );
}

async function deleteWeight(userId, date) {
  await query('DELETE FROM weights WHERE user_id=$1 AND date=$2', [userId, date]);
}

let _defaultUser = null;

async function getDefaultUser() {
  if (_defaultUser) return _defaultUser;
  const username = process.env.AUTH_USERNAME;
  if (username) {
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (rows[0]) { _defaultUser = rows[0]; return _defaultUser; }
  }
  const { rows } = await query('SELECT * FROM users ORDER BY id ASC LIMIT 1');
  if (!rows[0]) throw new Error('getDefaultUser: geen user in database');
  _defaultUser = rows[0];
  return _defaultUser;
}

async function getSleep(userId) {
  const { rows } = await query(
    'SELECT date, hours, quality, source FROM sleep WHERE user_id = $1',
    [userId]
  );
  const result = {};
  for (const row of rows) {
    const key = row.date.toISOString().split('T')[0];
    result[key] = {
      hours: Number(row.hours),
      quality: row.quality !== null ? Number(row.quality) : null,
      source: row.source,
    };
  }
  return result;
}

async function getNutrition(userId) {
  const { rows } = await query(
    'SELECT date, kcal, protein_g, carbs_g, fat_g, raw FROM nutrition WHERE user_id = $1',
    [userId]
  );
  const result = {};
  for (const row of rows) {
    const key = row.date.toISOString().split('T')[0];
    result[key] = row.raw || {
      kcal: row.kcal !== null ? Number(row.kcal) : null,
      protein: row.protein_g !== null ? Number(row.protein_g) : null,
      carbs: row.carbs_g !== null ? Number(row.carbs_g) : null,
      fat: row.fat_g !== null ? Number(row.fat_g) : null,
    };
  }
  return result;
}

async function getHevyWorkouts(userId) {
  const { rows } = await query(
    'SELECT raw FROM hevy_workouts WHERE user_id = $1 ORDER BY start_date ASC',
    [userId]
  );
  return rows.map(row => row.raw);
}

async function getActivityStream(userId, stravaId) {
  const { rows } = await query(
    'SELECT raw FROM activity_streams WHERE user_id = $1 AND strava_id = $2',
    [userId, String(stravaId)]
  );
  return rows[0] ? rows[0].raw : null;
}

async function upsertActivityStream(userId, stravaId, obj) {
  await query(
    `INSERT INTO activity_streams (user_id, strava_id, cached_at, raw)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (user_id, strava_id) DO UPDATE SET
       cached_at = now(),
       raw       = EXCLUDED.raw`,
    [userId, String(stravaId), JSON.stringify(obj)]
  );
  await query(
    `DELETE FROM activity_streams
     WHERE user_id = $1
       AND strava_id NOT IN (
         SELECT strava_id FROM activity_streams
         WHERE user_id = $1
         ORDER BY cached_at DESC
         LIMIT 200
       )`,
    [userId]
  );
}

async function upsertHevyWorkout(userId, workout) {
  await query(
    `INSERT INTO hevy_workouts (user_id, hevy_id, start_date, raw)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, hevy_id) DO UPDATE SET
       start_date = EXCLUDED.start_date,
       raw        = EXCLUDED.raw`,
    [userId, workout.id, workout.start_time || null, JSON.stringify(workout)]
  );
}

async function getWeightMap(userId) {
  const { rows } = await query(
    'SELECT date, weight_kg FROM weights WHERE user_id = $1',
    [userId]
  );
  const result = {};
  for (const row of rows) {
    const key = row.date.toISOString().split('T')[0];
    result[key] = Number(row.weight_kg);
  }
  return result;
}

async function upsertNutrition(userId, date, obj) {
  const kcal      = obj.kcal      != null ? parseInt(obj.kcal)      || null : null;
  const protein_g = obj.protein   != null ? parseFloat(obj.protein) || null : null;
  const carbs_g   = obj.carbs     != null ? parseFloat(obj.carbs)   || null : null;
  const fat_g     = obj.fat       != null ? parseFloat(obj.fat)     || null : null;
  await query(
    `INSERT INTO nutrition (user_id, date, kcal, protein_g, carbs_g, fat_g, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, date) DO UPDATE SET
       kcal      = EXCLUDED.kcal,
       protein_g = EXCLUDED.protein_g,
       carbs_g   = EXCLUDED.carbs_g,
       fat_g     = EXCLUDED.fat_g,
       raw       = EXCLUDED.raw`,
    [userId, date, kcal, protein_g, carbs_g, fat_g, JSON.stringify(obj)]
  );
}

async function deleteNutrition(userId, date) {
  await query('DELETE FROM nutrition WHERE user_id=$1 AND date=$2', [userId, date]);
}

async function upsertSleep(userId, date, obj) {
  const hours   = obj.hours   != null ? parseFloat(obj.hours) || null : null;
  const quality = obj.quality != null ? parseInt(obj.quality) || null : null;
  const source  = obj.source || 'manual';
  await query(
    `INSERT INTO sleep (user_id, date, hours, quality, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, date) DO UPDATE SET
       hours   = EXCLUDED.hours,
       quality = EXCLUDED.quality,
       source  = EXCLUDED.source`,
    [userId, date, hours, quality, source]
  );
}

async function insertPrescription(userId, p) {
  const { rows } = await query(
    `INSERT INTO training_prescriptions
       (user_id, prescribed_date, plan_run_id, session_type, target_duration_min,
        target_tss, target_if, blocks, mesocycle, distribution_model, planner_params, rationale)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [userId, p.prescribed_date, p.plan_run_id, p.session_type || null,
     p.target_duration_min ?? null, p.target_tss ?? null, p.target_if ?? null,
     p.blocks != null ? JSON.stringify(p.blocks) : null,
     p.mesocycle != null ? JSON.stringify(p.mesocycle) : null,
     p.distribution_model || null,
     p.planner_params != null ? JSON.stringify(p.planner_params) : null,
     p.rationale || null]
  );
  return rows[0].id;
}

async function supersedePrescription(oldId, newId) {
  await query(
    `UPDATE training_prescriptions SET status = 'superseded', superseded_by = $2 WHERE id = $1`,
    [oldId, newId]
  );
}

async function getActivePrescriptions(userId, fromDate, toDate) {
  const { rows } = await query(
    `SELECT * FROM training_prescriptions
     WHERE user_id = $1 AND status = 'active' AND prescribed_date BETWEEN $2 AND $3
     ORDER BY prescribed_date ASC`,
    [userId, fromDate, toDate]
  );
  return rows;
}

async function upsertSessionOutcome(userId, o) {
  const vals = [
    userId, o.prescription_id ?? null, o.strava_id ?? null, o.outcome_date,
    o.match_type, o.match_confidence ?? null, o.actual_duration_min ?? null,
    o.actual_tss ?? null, o.actual_if ?? null, o.actual_avg_power ?? null,
    o.deltas != null ? JSON.stringify(o.deltas) : null,
    o.execution_quality ?? null,
    o.pre_session_state != null ? JSON.stringify(o.pre_session_state) : null,
    o.response_markers != null ? JSON.stringify(o.response_markers) : null,
  ];
  const insertCols = `(user_id, prescription_id, strava_id, outcome_date, match_type,
    match_confidence, actual_duration_min, actual_tss, actual_if, actual_avg_power,
    deltas, execution_quality, pre_session_state, response_markers)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
  const updateBody = `
    outcome_date = EXCLUDED.outcome_date,
    match_type = EXCLUDED.match_type,
    match_confidence = EXCLUDED.match_confidence,
    actual_duration_min = EXCLUDED.actual_duration_min,
    actual_tss = EXCLUDED.actual_tss,
    actual_if = EXCLUDED.actual_if,
    actual_avg_power = EXCLUDED.actual_avg_power,
    deltas = EXCLUDED.deltas,
    execution_quality = EXCLUDED.execution_quality,
    pre_session_state = EXCLUDED.pre_session_state,
    response_markers = EXCLUDED.response_markers,
    reconciled_at = now()`;
  if (o.prescription_id != null) {
    await query(
      `INSERT INTO session_outcomes ${insertCols}
       ON CONFLICT (user_id, prescription_id) WHERE prescription_id IS NOT NULL
       DO UPDATE SET strava_id = EXCLUDED.strava_id, ${updateBody}`,
      vals
    );
  } else {
    await query(
      `INSERT INTO session_outcomes ${insertCols}
       ON CONFLICT (user_id, strava_id) WHERE strava_id IS NOT NULL
       DO UPDATE SET prescription_id = EXCLUDED.prescription_id, ${updateBody}`,
      vals
    );
  }
}

async function getLearnedParams(userId) {
  const { rows } = await query(
    `SELECT params, sample_size FROM athlete_model_params WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function getOutcomeHistory(userId, sessionType = null) {
  const { rows } = await query(
    `SELECT o.*, p.session_type AS presc_session_type, p.target_tss AS presc_target_tss,
            p.target_if AS presc_target_if, p.distribution_model, p.mesocycle, p.planner_params
     FROM session_outcomes o
     LEFT JOIN training_prescriptions p ON p.id = o.prescription_id
     WHERE o.user_id = $1 AND ($2::text IS NULL OR p.session_type = $2)
     ORDER BY o.outcome_date ASC`,
    [userId, sessionType]
  );
  return rows;
}

async function upsertActivityMMP(userId, stravaId, mmpEntry) {
  await query(
    'UPDATE activities SET mmp = $3 WHERE user_id = $1 AND strava_id = $2',
    [userId, stravaId, JSON.stringify(mmpEntry)]
  );
}

async function setPrescriptionStatus(id, status) {
  await query(
    'UPDATE training_prescriptions SET status = $2 WHERE id = $1',
    [id, status]
  );
}

async function upsertExerciseTemplate(userId, tpl) {
  await query(
    `INSERT INTO exercise_templates
       (user_id, template_id, title, primary_muscle_group, secondary_muscle_groups,
        type, is_custom, raw, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (user_id, template_id) DO UPDATE SET
       title                   = EXCLUDED.title,
       primary_muscle_group    = EXCLUDED.primary_muscle_group,
       secondary_muscle_groups = EXCLUDED.secondary_muscle_groups,
       type                    = EXCLUDED.type,
       is_custom               = EXCLUDED.is_custom,
       raw                     = EXCLUDED.raw,
       fetched_at              = EXCLUDED.fetched_at`,
    [
      userId,
      tpl.id,
      tpl.title || null,
      tpl.primary_muscle_group || null,
      tpl.secondary_muscle_groups != null ? JSON.stringify(tpl.secondary_muscle_groups) : null,
      tpl.type || null,
      tpl.is_custom ?? null,
      JSON.stringify(tpl),
    ]
  );
}

async function getExerciseTemplates(userId) {
  const { rows } = await query(
    `SELECT template_id, title, primary_muscle_group, secondary_muscle_groups, is_custom
     FROM exercise_templates WHERE user_id = $1`,
    [userId]
  );
  const map = {};
  for (const row of rows) {
    map[row.template_id] = {
      primary:   row.primary_muscle_group,
      secondary: row.secondary_muscle_groups || [],
      title:     row.title,
      isCustom:  row.is_custom,
    };
  }
  return map;
}

module.exports = {
  pool, query, initSchema,
  getUser, saveUserFields,
  getActivities, getActivitiesLite, upsertActivity, upsertActivityMMP,
  getWeights, upsertWeight, deleteWeight,
  getDefaultUser, getSleep, getNutrition, getHevyWorkouts, getWeightMap,
  upsertNutrition, deleteNutrition, upsertSleep, upsertHevyWorkout,
  getActivityStream, upsertActivityStream,
  insertPrescription, supersedePrescription, getActivePrescriptions,
  upsertSessionOutcome, getLearnedParams, getOutcomeHistory,
  setPrescriptionStatus,
  upsertExerciseTemplate, getExerciseTemplates,
};
