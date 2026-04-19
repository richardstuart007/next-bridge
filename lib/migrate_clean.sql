-- ============================================================
-- migrate_clean.sql
-- Run on LOCAL first, then identically on PROD.
-- Step 1: Rename existing tables to # prefix (backup)
-- Step 2: Create clean tables (no foreign keys, indexes only)
-- Step 3: Copy data from backup tables to new tables
-- Step 4: Reset sequences
-- Step 5: Drop backup tables (run manually once verified)
-- ============================================================


-- ============================================================
-- STEP 1: Rename existing tables to # backup
-- ============================================================

ALTER TABLE IF EXISTS tpl_players          RENAME TO "#tpl_players";
ALTER TABLE IF EXISTS tse_sessions         RENAME TO "#tse_sessions";
ALTER TABLE IF EXISTS tpa_partners         RENAME TO "#tpa_partners";
ALTER TABLE IF EXISTS tre_results          RENAME TO "#tre_results";
ALTER TABLE IF EXISTS trw_results_raw      RENAME TO "#trw_results_raw";
ALTER TABLE IF EXISTS tam_players_ambiguous RENAME TO "#tam_players_ambiguous";
ALTER TABLE IF EXISTS tfl_fetch_log        RENAME TO "#tfl_fetch_log";
ALTER TABLE IF EXISTS tlg_logging          RENAME TO "#tlg_logging";


-- ============================================================
-- STEP 2: Create clean tables (no foreign keys)
-- ============================================================

CREATE TABLE tpl_players (
  pl_plid               SERIAL        PRIMARY KEY,
  pl_name               VARCHAR(100)  NOT NULL UNIQUE,
  pl_nz_bridge_number   INTEGER       NOT NULL DEFAULT 0,
  pl_club               VARCHAR(100)  NOT NULL DEFAULT '',
  pl_rank               VARCHAR(100)  NOT NULL DEFAULT '',
  pl_grade              VARCHAR(50)   NOT NULL DEFAULT '',
  pl_rating             NUMERIC(10,2) NOT NULL DEFAULT 0,
  pl_a_points           NUMERIC(10,2) NOT NULL DEFAULT 0,
  pl_b_points           NUMERIC(10,2) NOT NULL DEFAULT 0,
  pl_c_points           NUMERIC(10,2) NOT NULL DEFAULT 0,
  pl_last_updated       TIMESTAMP     DEFAULT NOW(),
  pl_avg_percentage     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pl_session_count      INTEGER       NOT NULL DEFAULT 0,
  pl_mp_avg_percentage  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pl_mp_session_count   INTEGER       NOT NULL DEFAULT 0,
  pl_imp_avg_percentage NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pl_imp_session_count  INTEGER       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX uq_pl_nz_bridge_number ON tpl_players (pl_nz_bridge_number) WHERE pl_nz_bridge_number > 0;

CREATE TABLE tse_sessions (
  se_seid         SERIAL       PRIMARY KEY,
  se_date         DATE         NOT NULL,
  se_day_of_week  VARCHAR(10)  NOT NULL,
  se_scoring      VARCHAR(20)  NOT NULL,
  se_source_id    INTEGER      NOT NULL UNIQUE,
  se_date_seq     INTEGER      NOT NULL DEFAULT 0,
  se_session_type VARCHAR(20)  NOT NULL DEFAULT 'club'
);

CREATE TABLE tpa_partners (
  pa_paid         SERIAL        PRIMARY KEY,
  pa_plid1        INTEGER       NOT NULL,
  pa_plid2        INTEGER       NOT NULL,
  pa_sessions     INTEGER       NOT NULL DEFAULT 0,
  pa_avg_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pa_mp_sessions  INTEGER       NOT NULL DEFAULT 0,
  pa_mp_avg_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pa_imp_sessions INTEGER       NOT NULL DEFAULT 0,
  pa_imp_avg_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  pa_last_updated TIMESTAMP     DEFAULT NOW(),
  UNIQUE (pa_plid1, pa_plid2)
);

CREATE TABLE tre_results (
  re_reid         SERIAL        PRIMARY KEY,
  re_seid         INTEGER,
  re_plid         INTEGER,
  re_partner_plid INTEGER,
  re_pairid       INTEGER,
  re_percentage   DECIMAL(5,2)  NOT NULL,
  re_imp_score    NUMERIC(8,1)
);
CREATE INDEX idx_tre_results_plid         ON tre_results (re_plid);
CREATE INDEX idx_tre_results_partner_plid ON tre_results (re_partner_plid);
CREATE INDEX idx_tre_results_seid         ON tre_results (re_seid);
CREATE INDEX idx_tre_results_pairid       ON tre_results (re_pairid);

CREATE TABLE trw_results_raw (
  rw_rwid       SERIAL        PRIMARY KEY,
  rw_seid       INTEGER       NOT NULL,
  rw_name1      VARCHAR(100)  NOT NULL,
  rw_name2      VARCHAR(100)  NOT NULL,
  rw_percentage DECIMAL(5,2)  NOT NULL,
  rw_rank       INTEGER,
  rw_imp_score  NUMERIC(8,1)
);
CREATE INDEX idx_trw_results_raw_seid ON trw_results_raw (rw_seid);

CREATE TABLE tam_players_ambiguous (
  am_amid        SERIAL        PRIMARY KEY,
  am_search_name VARCHAR(100)  NOT NULL DEFAULT '',
  am_nz_number   INTEGER       NOT NULL DEFAULT 0,
  am_nz_name     VARCHAR(100)  NOT NULL DEFAULT '',
  am_club        VARCHAR(100)  NOT NULL DEFAULT '',
  am_created     TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE tfl_fetch_log (
  fl_flid    SERIAL    PRIMARY KEY,
  fl_seid    INTEGER   NOT NULL,
  fl_run_at  TIMESTAMP DEFAULT NOW(),
  fl_pairs   INTEGER   NOT NULL DEFAULT 0,
  fl_skipped BOOLEAN   NOT NULL DEFAULT FALSE,
  fl_error   TEXT
);
CREATE INDEX idx_tfl_fetch_log_seid ON tfl_fetch_log (fl_seid);

CREATE TABLE tlg_logging (
  lg_lgid         SERIAL        PRIMARY KEY,
  lg_datetime     TIMESTAMPTZ,
  lg_msg          TEXT,
  lg_functionname VARCHAR(128),
  lg_caller       VARCHAR(128),
  lg_severity     VARCHAR(4)
);


-- ============================================================
-- STEP 3: Copy data from backup tables to new tables
-- ============================================================

INSERT INTO tpl_players (
  pl_plid, pl_name, pl_nz_bridge_number, pl_club, pl_rank, pl_grade,
  pl_rating, pl_a_points, pl_b_points, pl_c_points, pl_last_updated,
  pl_avg_percentage, pl_session_count,
  pl_mp_avg_percentage, pl_mp_session_count,
  pl_imp_avg_percentage, pl_imp_session_count
)
SELECT
  pl_plid, pl_name, pl_nz_bridge_number, pl_club, pl_rank, pl_grade,
  pl_rating, pl_a_points, pl_b_points, pl_c_points, pl_last_updated,
  pl_avg_percentage, pl_session_count,
  pl_mp_avg_percentage, pl_mp_session_count,
  pl_imp_avg_percentage, pl_imp_session_count
FROM "#tpl_players";

INSERT INTO tse_sessions (
  se_seid, se_date, se_day_of_week, se_scoring, se_source_id, se_date_seq, se_session_type
)
SELECT
  se_seid, se_date, se_day_of_week, se_scoring, se_source_id, se_date_seq, se_session_type
FROM "#tse_sessions";

INSERT INTO tpa_partners (
  pa_paid, pa_plid1, pa_plid2, pa_sessions, pa_avg_pct,
  pa_mp_sessions, pa_mp_avg_pct, pa_imp_sessions, pa_imp_avg_pct, pa_last_updated
)
SELECT
  pa_paid, pa_plid1, pa_plid2, pa_sessions, pa_avg_pct,
  pa_mp_sessions, pa_mp_avg_pct, pa_imp_sessions, pa_imp_avg_pct, pa_last_updated
FROM "#tpa_partners";

INSERT INTO tre_results (
  re_reid, re_seid, re_plid, re_partner_plid, re_pairid, re_percentage, re_imp_score
)
SELECT
  re_reid, re_seid, re_plid, re_partner_plid, re_pairid, re_percentage, re_imp_score
FROM "#tre_results";

INSERT INTO trw_results_raw (
  rw_rwid, rw_seid, rw_name1, rw_name2, rw_percentage, rw_rank, rw_imp_score
)
SELECT
  rw_rwid, rw_seid, rw_name1, rw_name2, rw_percentage, rw_rank, rw_imp_score
FROM "#trw_results_raw";

INSERT INTO tam_players_ambiguous (
  am_amid, am_search_name, am_nz_number, am_nz_name, am_club, am_created
)
SELECT
  am_amid, am_search_name, am_nz_number, am_nz_name, am_club, am_created
FROM "#tam_players_ambiguous";

INSERT INTO tfl_fetch_log (
  fl_flid, fl_seid, fl_run_at, fl_pairs, fl_skipped, fl_error
)
SELECT
  fl_flid, fl_seid, fl_run_at, fl_pairs, fl_skipped, fl_error
FROM "#tfl_fetch_log";

INSERT INTO tlg_logging (
  lg_lgid, lg_datetime, lg_msg, lg_functionname, lg_caller, lg_severity
)
SELECT
  lg_lgid, lg_datetime, lg_msg, lg_functionname, lg_caller, lg_severity
FROM "#tlg_logging";


-- ============================================================
-- STEP 4: Reset sequences to max existing ID + 1
-- ============================================================

SELECT setval('tpl_players_pl_plid_seq',          (SELECT COALESCE(MAX(pl_plid), 0)  FROM tpl_players));
SELECT setval('tse_sessions_se_seid_seq',          (SELECT COALESCE(MAX(se_seid), 0)  FROM tse_sessions));
SELECT setval('tpa_partners_pa_paid_seq',          (SELECT COALESCE(MAX(pa_paid), 0)  FROM tpa_partners));
SELECT setval('tre_results_re_reid_seq',           (SELECT COALESCE(MAX(re_reid), 0)  FROM tre_results));
SELECT setval('trw_results_raw_rw_rwid_seq',       (SELECT COALESCE(MAX(rw_rwid), 0)  FROM trw_results_raw));
SELECT setval('tam_players_ambiguous_am_amid_seq', (SELECT COALESCE(MAX(am_amid), 0)  FROM tam_players_ambiguous));
SELECT setval('tfl_fetch_log_fl_flid_seq',         (SELECT COALESCE(MAX(fl_flid), 0)  FROM tfl_fetch_log));
SELECT setval('tlg_logging_lg_lgid_seq',           (SELECT COALESCE(MAX(lg_lgid), 0)  FROM tlg_logging));


-- ============================================================
-- STEP 5: Drop backup tables (run manually after verifying data)
-- ============================================================

-- DROP TABLE "#tpl_players";
-- DROP TABLE "#tse_sessions";
-- DROP TABLE "#tpa_partners";
-- DROP TABLE "#tre_results";
-- DROP TABLE "#trw_results_raw";
-- DROP TABLE "#tam_players_ambiguous";
-- DROP TABLE "#tfl_fetch_log";
-- DROP TABLE "#tlg_logging";
