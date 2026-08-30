# PLAN_pipeline-runid-bare-number — next-bridge

## Title
Pipeline run-id picker shows a bare number, not "Run # (N)"

## Plan

- [x] **src/ui/admin/PipelineTable.tsx** — in both `PipelineJobsSummary` and `OverviewSummary`,
  change the run-id `<MySelect>`:
  - `options={recentRunIds.map(id => \`Run # (${id})\`)}` → `options={recentRunIds.map(String)}`
  - `value={selectedRunId != null ? \`Run # (${selectedRunId})\` : ''}` → `value={selectedRunId != null ? String(selectedRunId) : ''}`
  - `onChange={e => handleSelectRunId(parseInt(e.target.value.replace(/\D/g, ''), 10))}` → `onChange={e => handleSelectRunId(parseInt(e.target.value, 10))}`
- [x] `npx tsc --noEmit` clean

- [x] **src/lib/constants.ts** — `PIPELINE_RECENT_RUN_IDS_LIMIT` `5` → `10` (agreed value: 10).
  Feeds `getRecentRunIds` in `pipelineLog.ts` (`ORDER BY pip_run_id DESC LIMIT …`), which is the
  only source of the picker's list — no other change needed.
- [x] `npx tsc --noEmit` clean

Constraints: display-only change; the two `<MySelect>` blocks are identical so both get the same
edit. The run-id count is a single agreed constant value (10).

## Changes

### src/ui/admin/PipelineTable.tsx
- `PipelineJobsSummary` and `OverviewSummary` run-id `<MySelect>` (identical blocks, one `replace_all` edit):
  - `options` now `recentRunIds.map(String)` — bare numbers instead of `` `Run # (${id})` ``
  - `value` now `String(selectedRunId)` instead of `` `Run # (${selectedRunId})` ``
  - `onChange` now `parseInt(e.target.value, 10)` — the `.replace(/\D/g, '')` was only needed to strip the `Run # (…)` wrapper, so it's gone

`npx tsc --noEmit` clean.

### src/lib/constants.ts
- `PIPELINE_RECENT_RUN_IDS_LIMIT` 5 → 10. `npx tsc --noEmit` clean.

## Testing
- [ ] `/owner/pipeline` → any tab with a Summary panel (Overview / AKBC / Tracked Players / Finish): the run-id dropdown now lists bare numbers and shows up to 10 recent run_ids; selecting one still loads that run's Jobs rows, and the ↻ refresh still works.
