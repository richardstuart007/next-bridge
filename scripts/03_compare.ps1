# Compare row counts between local PostgreSQL and Neon prod.
# Run from the project root after export/import to verify they match.

$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

# Load local password from .env.locallocal
$envLocal = Join-Path $PSScriptRoot "..\\.env.locallocal"
foreach ($line in Get-Content $envLocal) {
    if ($line -match '^\s*POSTGRES_PASSWORD\s*=\s*(.+)') { $env:PGPASSWORD = $Matches[1].Trim() }
}

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

$localCounts = @{}
foreach ($t in $tables) {
    $result = (& $psql -U postgres -d bridgedb -t -c "SELECT COUNT(*) FROM $t") -join ""
    $localCounts[$t] = $result.Trim()
}

# Switch to Neon credentials
$envProd = Join-Path $PSScriptRoot "..\\.env.localprod"
foreach ($line in Get-Content $envProd) {
    if ($line -match '^\s*PGPASSWORD\s*=\s*(.+)')       { $env:PGPASSWORD = $Matches[1].Trim() }
    if ($line -match '^\s*PGHOST_UNPOOLED\s*=\s*(.+)')  { $neon_host = $Matches[1].Trim() }
    if ($line -match '^\s*PGUSER\s*=\s*(.+)')            { $neon_user = $Matches[1].Trim() }
    if ($line -match '^\s*PGDATABASE\s*=\s*(.+)')        { $neon_db   = $Matches[1].Trim() }
}

Write-Host ""
Write-Host ("{0,-35} {1,10} {2,10} {3,6}" -f "Table", "Local", "Prod", "Match")
Write-Host ("-" * 65)

foreach ($t in $tables) {
    $result = (& $psql -h $neon_host -U $neon_user -d $neon_db -t -c "SELECT COUNT(*) FROM $t") -join ""
    $prodCount = $result.Trim()
    $localCount = $localCounts[$t]
    $match = if ($localCount -eq $prodCount) { "OK" } else { "DIFF" }
    Write-Host ("{0,-35} {1,10} {2,10} {3,6}" -f $t, $localCount, $prodCount, $match)
}

Write-Host ""
