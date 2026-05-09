# Export production tables from local PostgreSQL to CSV files.
# Run from the project root. No password required (trusted local connection).
# Output folder: C:/bridge-export/

$export_dir = "C:/bridge-export"
New-Item -ItemType Directory -Force -Path $export_dir | Out-Null

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
    Write-Host "Exporting $t ..."
    psql -U postgres -d bridgedb -c "\COPY $t TO '$export_dir/$t.csv' WITH CSV HEADER"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed on $t"; exit 1 }
}

Write-Host "Done. Files written to $export_dir"
