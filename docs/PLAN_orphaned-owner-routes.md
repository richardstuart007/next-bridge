# PLAN_orphaned-owner-routes — next-bridge

## Title
Delete orphaned owner/cache, owner/logging, owner/dataflow standalone routes

## Plan
- [ ] Confirmed via `owner/page.tsx`'s `OwnerPage` tabs (Logging/Cache tabs render
      `OwnerTableLogging`/`OwnerTableCache` inline; Dataflow tab renders `DataflowTabs` inline) and
      a grep of `src/` for `owner/cache`, `owner/logging`, `owner/dataflow` — zero matches — that
      these three standalone routes are unreachable dead code left over from before the
      `OwnerPage` tab migration, duplicating content the tabs already show. Distinct from
      `owner/pipeline`, `owner/players`, `owner/builddata`, which remain deliberately live (linked
      from the `Data` tab's `ToolsPanel`) and are out of scope here.
- [ ] Delete `src/app/owner/cache/page.tsx`
- [ ] Delete `src/app/owner/logging/page.tsx`
- [ ] Delete `src/app/owner/dataflow/page.tsx`
- [ ] Run:
      npx tsc --noEmit
- [ ] Run:
      npm run build

## Changes
