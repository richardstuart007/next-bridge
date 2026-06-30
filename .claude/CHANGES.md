# Changes — next-bridge, "version": "0.1.3"

## src/app/api/cron/update-sessions/route.ts
- Added RESTART IDENTITY to both TRUNCATE statements (ts1_sessions/ts2_results and ta1_player_stats/ta2_partner_stats) so sequences reset to 1 on each rebuild rather than advancing indefinitely
