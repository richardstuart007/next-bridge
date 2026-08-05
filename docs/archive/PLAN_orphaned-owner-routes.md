# PLAN_orphaned-owner-routes — next-bridge

## Title
Delete orphaned owner/cache, owner/logging, owner/dataflow standalone routes

## Plan
- [x] Confirmed via `owner/page.tsx`'s `OwnerPage` tabs (Logging/Cache tabs render
      `OwnerTableLogging`/`OwnerTableCache` inline; Dataflow tab renders `DataflowTabs` inline) and
      a grep of `src/` for `owner/cache`, `owner/logging`, `owner/dataflow` — zero matches — that
      these three standalone routes are unreachable dead code left over from before the
      `OwnerPage` tab migration, duplicating content the tabs already show. Distinct from
      `owner/pipeline`, `owner/players`, `owner/builddata`, which remain deliberately live (linked
      from the `Data` tab's `ToolsPanel`) and are out of scope here.
- [x] Delete `src/app/owner/cache/page.tsx`
- [x] Delete `src/app/owner/logging/page.tsx`
- [x] Delete `src/app/owner/dataflow/page.tsx`
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes
### src/app/owner/cache/page.tsx
- Deleted — orphaned standalone route, superseded by `OwnerTableCache` rendered inline in the
  `OwnerPage` Cache tab.

### src/app/owner/logging/page.tsx
- Deleted — orphaned standalone route, superseded by `OwnerTableLogging` rendered inline in the
  `OwnerPage` Logging tab.

### src/app/owner/dataflow/page.tsx
- Deleted — orphaned standalone route, superseded by `DataflowTabs` rendered inline in the
  `OwnerPage` Dataflow tab.

- Also removed the now-empty `src/app/owner/cache/`, `src/app/owner/logging/`, and
  `src/app/owner/dataflow/` directories left behind after deleting each `page.tsx`.
- `npx tsc --noEmit` initially failed on stale `.next/types/validator.ts` references to the
  deleted routes; `npm run build` regenerated that file and both the build and its internal
  TypeScript check passed cleanly.

## Testing
- [ ] Confirmed via `npx tsc --noEmit` + `npm run build` — both pass, and the build's route list
      no longer includes `/owner/cache`, `/owner/logging`, or `/owner/dataflow`. No user-facing
      change to verify since these routes were already unreachable (unlinked from any page); the
      `OwnerPage` tabs (`/owner` → Logging/Cache/Dataflow tabs) still render the same content they
      always did.
