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
  `);
}

const ALLOWED_USER_FIELDS = new Set([
  'goals', 'patterns', 'settings', 'week_plan',
  'ai_insights', 'week_availability', 'calibration', 'literature',
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

module.exports = {
  pool, query, initSchema,
  getUser, saveUserFields,
  getActivities, upsertActivity,
  getWeights, upsertWeight,
  getDefaultUser, getSleep, getNutrition, getHevyWorkouts, getWeightMap,
  upsertNutrition,
};
