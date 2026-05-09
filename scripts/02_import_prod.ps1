# Import production table CSVs into Neon production.
# Uses the unpooled (direct) Neon host — more reliable for batch COPY than the pooler.
# psql will prompt for password, or set $env:PGPASSWORD before running.

$neon_host = "ep-still-flower-amv17pyu.c-5.us-east-1.aws.neon.tech"
$neon_user = "neondb_owner"
$neon_db   = "neondb"
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
    "tet_event_types"
)

foreach ($t in $tables) {
    Write-Host "Truncating $t ..."
    psql -h $neon_host -U $neon_user -d $neon_db -c "TRUNCATE $t RESTART IDENTITY CASCADE"
    if ($LASTEXITCODE -ne 0) { Write-Error "Truncate failed on $t"; exit 1 }
    Write-Host "Importing $t ..."
    psql -h $neon_host -U $neon_user -d $neon_db -c "\COPY $t FROM '$export_dir/$t.csv' WITH CSV HEADER"
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
    "SELECT setval('tet_event_types_et_etid_seq',        (SELECT COALESCE(MAX(et_etid), 0) FROM tet_event_types))"
)

foreach ($sql in $seqcmds) {
    psql -h $neon_host -U $neon_user -d $neon_db -c $sql
    if ($LASTEXITCODE -ne 0) { Write-Error "Sequence reset failed: $sql"; exit 1 }
}

Write-Host "Import complete."
