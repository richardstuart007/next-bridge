-- Bridge Results Tracker Schema
-- Naming convention: txx_name tables, xx_columnname columns, xx_yy_id foreign keys

CREATE TABLE IF NOT EXISTS tpl_players (
  pl_plid             SERIAL PRIMARY KEY,
  pl_name             VARCHAR(100) NOT NULL UNIQUE,
  pl_nz_bridge_number INTEGER      NOT NULL DEFAULT 0,  -- 0 = no number assigned
  pl_club             VARCHAR(100) NOT NULL DEFAULT '',
  pl_rank             VARCHAR(100) NOT NULL DEFAULT '',
  pl_grade            VARCHAR(50)  NOT NULL DEFAULT '',
  pl_rating           DECIMAL(10,2) NOT NULL DEFAULT 0,
  pl_a_points         DECIMAL(10,2) NOT NULL DEFAULT 0,
  pl_b_points         DECIMAL(10,2) NOT NULL DEFAULT 0,
  pl_c_points         DECIMAL(10,2) NOT NULL DEFAULT 0,
  pl_session_count    INTEGER      NOT NULL DEFAULT 0,
  pl_avg_percentage   DECIMAL(5,2) NOT NULL DEFAULT 0,
  pl_last_updated     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tse_sessions (
  se_seid         SERIAL PRIMARY KEY,
  se_date         DATE NOT NULL,
  se_day_of_week  VARCHAR(10) NOT NULL,
  se_date_seq     INTEGER      NOT NULL DEFAULT 0,
  se_session_type VARCHAR(20) NOT NULL DEFAULT 'club',  -- 'club' or 'online'
  se_scoring      VARCHAR(20) NOT NULL DEFAULT 'MP',    -- 'MP' or 'IMP'
  se_source_id    INTEGER UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tpa_partners (
  pa_paid         SERIAL PRIMARY KEY,
  pa_plid1        INTEGER NOT NULL,
  pa_plid2        INTEGER NOT NULL,
  pa_sessions     INTEGER NOT NULL DEFAULT 0,
  pa_avg_pct      DECIMAL(5,2) NOT NULL DEFAULT 0,
  pa_last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE (pa_plid1, pa_plid2)
);

CREATE TABLE IF NOT EXISTS tre_results (
  re_reid         SERIAL PRIMARY KEY,
  re_seid         INTEGER,
  re_plid         INTEGER,
  re_partner_plid INTEGER,
  re_pairid       INTEGER,
  re_percentage   DECIMAL(5,2) NOT NULL
);

-- Partial unique indexes (exclude default/unset values)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pl_nz_bridge_number ON tpl_players (pl_nz_bridge_number) WHERE pl_nz_bridge_number > 0;

-- trw_results_raw: staging table — raw pair names from AKBC before player ID resolution
CREATE TABLE IF NOT EXISTS trw_results_raw (
  rw_rwid       SERIAL PRIMARY KEY,
  rw_seid       INTEGER NOT NULL,
  rw_name1      VARCHAR(100) NOT NULL,  -- alphabetically first
  rw_name2      VARCHAR(100) NOT NULL,  -- alphabetically second
  rw_percentage DECIMAL(5,2) NOT NULL
);

-- tam_players_ambiguous: players where nzbridge.co.nz returned multiple matches for review
CREATE TABLE IF NOT EXISTS tam_players_ambiguous (
  am_amid        SERIAL PRIMARY KEY,
  am_search_name VARCHAR(100) NOT NULL DEFAULT '',
  am_nz_number   INTEGER      NOT NULL DEFAULT 0,
  am_nz_name     VARCHAR(100) NOT NULL DEFAULT '',
  am_club        VARCHAR(100) NOT NULL DEFAULT '',
  am_created     TIMESTAMP DEFAULT NOW()
);

-- tfl_fetch_log: tracks per-session fetch-results outcomes for admin review
CREATE TABLE IF NOT EXISTS tfl_fetch_log (
  fl_flid    SERIAL PRIMARY KEY,
  fl_seid    INTEGER NOT NULL,
  fl_run_at  TIMESTAMP DEFAULT NOW(),
  fl_pairs   INTEGER NOT NULL DEFAULT 0,
  fl_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  fl_error   TEXT
);
CREATE INDEX IF NOT EXISTS idx_tfl_fetch_log_seid ON tfl_fetch_log (fl_seid);

-- tlg_logging: required by nextjs-shared write_Logging
CREATE TABLE IF NOT EXISTS tlg_logging (
  lg_lgid         SERIAL PRIMARY KEY,
  lg_datetime     TIMESTAMPTZ,
  lg_msg          TEXT,
  lg_functionname VARCHAR(128),
  lg_caller       VARCHAR(128),
  lg_severity     VARCHAR(4)
);
