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
      calibration      JSONB NOT NULL DEFAULT '{}'::jsonb
    );

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

module.exports = { pool, query, initSchema };
