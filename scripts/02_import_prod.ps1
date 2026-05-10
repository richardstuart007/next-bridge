# Import production table CSVs into Neon production.
# Uses the unpooled (direct) Neon host — more reliable for batch COPY than the pooler.
# Reads credentials from .env.localprod.

$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

# Load Neon credentials from .env.localprod
$envFile = Join-Path $PSScriptRoot "..\\.env.localprod"
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*PGPASSWORD\s*=\s*(.+)')  { $env:PGPASSWORD = $Matches[1].Trim() }
    if ($line -match '^\s*PGHOST_UNPOOLED\s*=\s*(.+)') { $neon_host = $Matches[1].Trim() }
    if ($line -match '^\s*PGUSER\s*=\s*(.+)')      { $neon_user = $Matches[1].Trim() }
    if ($line -match '^\s*PGDATABASE\s*=\s*(.+)')  { $neon_db   = $Matches[1].Trim() }
}

$export_dir = "C:/bridge-export"

$tables = @(
    "tpl_players",
    "tse_sessions",
    "tpa_partners",
    "tre_results",
    "trk_ranks",
    "tcl_clubs",
    "tgr_grades",
    "ttt_tournament_types",
    "tet_event_types",
    "ta1_player_stats",
    "ta2_partner_stats"
)

foreach ($t in $tables) {
    Write-Host "Truncating $t ..."
    & $psql -h $neon_host -U $neon_user -d $neon_db -c "TRUNCATE $t RESTART IDENTITY CASCADE"
    if ($LASTEXITCODE -ne 0) { Write-Error "Truncate failed on $t"; exit 1 }
    Write-Host "Importing $t ..."
    & $psql -h $neon_host -U $neon_user -d $neon_db -c "\COPY $t FROM '$export_dir/$t.csv' WITH CSV HEADER"
    if ($LASTEXITCODE -ne 0) { Write-Error "Import failed on $t"; exit 1 }
}

# Reset sequences so next INSERT gets a correct ID.
Write-Host "Resetting sequences ..."
$seqcmds = @(
    "SELECT setval('tpl_players_pl_plid_seq',           (SELECT COALESCE(MAX(pl_plid), 0) FROM tpl_players))",
    "SELECT setval('tse_sessions_se_seid_seq',           (SELECT COALESCE(MAX(se_seid), 0) FROM tse_sessions))",
    "SELECT setval('tpa_partners_pa_paid_seq',           (SELECT COALESCE(MAX(pa_paid), 0) FROM tpa_partners))",
    "SELECT setval('tre_results_re_reid_seq',            (SELECT COALESCE(MAX(re_reid), 0) FROM tre_results))",
    "SELECT setval('trk_ranks_rk_rkid_seq',              (SELECT COALESCE(MAX(rk_rkid), 0) FROM trk_ranks))",
    "SELECT setval('tcl_clubs_cl_clid_seq',              (SELECT COALESCE(MAX(cl_clid), 0) FROM tcl_clubs))",
    "SELECT setval('tgr_grades_gr_grid_seq',             (SELECT COALESCE(MAX(gr_grid), 0) FROM tgr_grades))",
    "SELECT setval('ttt_tournament_types_tt_ttid_seq',   (SELECT COALESCE(MAX(tt_ttid), 0) FROM ttt_tournament_types))",
    "SELECT setval('tet_event_types_et_etid_seq',        (SELECT COALESCE(MAX(et_etid), 0) FROM tet_event_types))",
    "SELECT setval('ta1_player_stats_a1_a1id_seq',       (SELECT COALESCE(MAX(a1_a1id), 0) FROM ta1_player_stats))",
    "SELECT setval('ta2_partner_stats_a2_a2id_seq',      (SELECT COALESCE(MAX(a2_a2id), 0) FROM ta2_partner_stats))"
)

foreach ($sql in $seqcmds) {
    & $psql -h $neon_host -U $neon_user -d $neon_db -c $sql
    if ($LASTEXITCODE -ne 0) { Write-Error "Sequence reset failed: $sql"; exit 1 }
}

Write-Host "Import complete."
