# Plan — next-bridge

## Current task: Restructure owner section — promote /owner/admin/* to /owner/*

### Summary
Removed the `/owner/admin` sub-path. All admin tool pages now live directly under `/owner/*`.
The `/owner` landing page is a tabbed dashboard (Tools / Logging / Cache) instead of a redirect.
New `DevHeader` component handles the dev-only header with sessionStorage back-navigation.
Package versions pinned (save-exact via .npmrc, all carets removed), postcss promoted to dep,
overrides section removed.

- [x] Delete `src/app/owner/admin/*` (8 pages + layout)
- [x] Create `src/app/owner/build/page.tsx`
- [x] Create `src/app/owner/builddata/page.tsx`
- [x] Create `src/app/owner/cache/page.tsx`
- [x] Create `src/app/owner/cron/page.tsx`
- [x] Create `src/app/owner/logging/page.tsx`
- [x] Create `src/app/owner/players/page.tsx`
- [x] Create `src/app/owner/scrape/page.tsx`
- [x] Create `src/app/owner/stats/page.tsx`
- [x] Rewrite `src/app/owner/page.tsx` — tabbed dashboard (Tools / Logging / Cache)
- [x] Rewrite `src/app/owner/layout.tsx` — client component; back-link from sessionStorage
- [x] Create `src/ui/DevHeader.tsx` — dev header extracted from layout.tsx
- [x] Update `src/app/layout.tsx` — use `<DevHeader />`
- [x] Update `package.json` — pin versions, fix npm scripts, add postcss dep, remove overrides
- [x] Add `.npmrc` — save-exact=true so all future installs pin versions
- [ ] Commit all
- [ ] Clear CHANGES.md

### No SQL required
All changes are UI/routing only.

## Completed tasks

### 2026-06-15 — Update write_Logging → write_logging (consume nextjs-shared v2.0.2)
- [x] Search/replace `write_Logging` → `write_logging` in all `.ts` files (19 files, 57 occurrences)
- [x] npm update nextjs-shared — re-resolved git ref, package-lock.json updated
