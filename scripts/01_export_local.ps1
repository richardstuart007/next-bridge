# Export production tables from local PostgreSQL to CSV files.
# Run from the project root. Reads credentials from .env.locallocal.
# Output folder: C:/bridge-export/

$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

# Load local password from .env.locallocal
$envFile = Join-Path $PSScriptRoot "..\\.env.locallocal"
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*POSTGRES_PASSWORD\s*=\s*(.+)') {
        $env:PGPASSWORD = $Matches[1].Trim()
    }
}

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
    "tet_event_types",
    "ta1_player_stats",
    "ta2_partner_stats"
)

foreach ($t in $tables) {
    Write-Host "Exporting $t ..."
    & $psql -U postgres -d bridgedb -c "\COPY $t TO '$export_dir/$t.csv' WITH CSV HEADER"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed on $t"; exit 1 }
}

Write-Host "Done. Files written to $export_dir"
