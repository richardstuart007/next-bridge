# Changes — 2026-06-15

## src/ — write_Logging → write_logging
- Search/replace `write_Logging` → `write_logging` across all `.ts` files (19 files, 57 occurrences)

## package-lock.json
- Updated nextjs-shared resolved commit to v2.0.2 via npm update nextjs-shared

## src/app/owner/admin/* — deleted
- Removed entire `/owner/admin` sub-path (8 pages + layout); content moved to `/owner/*`

## src/app/owner/build/page.tsx (new)
## src/app/owner/builddata/page.tsx (new)
## src/app/owner/cache/page.tsx (new)
## src/app/owner/cron/page.tsx (new)
## src/app/owner/logging/page.tsx (new)
## src/app/owner/players/page.tsx (new)
## src/app/owner/scrape/page.tsx (new)
## src/app/owner/stats/page.tsx (new)
- All moved from `/owner/admin/*` to `/owner/*` (one level shallower); thin wrappers unchanged

## src/app/owner/page.tsx
- Was: `redirect('/owner/admin')`. Now: client-side tabbed dashboard with Tools / Logging / Cache tabs
- Tools tab renders pipeline steps as clickable cards linking to `/owner/*`
- Logging tab renders `OwnerTableLogging` from nextjs-shared
- Cache tab renders `OwnerTableCache` from nextjs-shared

## src/app/owner/layout.tsx
- Was: server component with `redirect()`. Now: `'use client'` component
- Reads `sessionStorage.ownerFrom` and renders a back-link at top of every owner page
- Uses `window.location.href` for the prod-guard redirect (can't use `redirect()` in client component)

## src/ui/DevHeader.tsx (new)
- New client component extracted from `layout.tsx`
- Renders the dev-only top header: "Owner" link (saves current path to sessionStorage before navigating) + DB location badge
- Replaces the inline `<header>` block that was embedded in `layout.tsx`

## src/app/layout.tsx
- Removed inline `<header>` JSX (nav links + floating badge) — replaced with `<DevHeader dbLocation={DB_LOCATION} />`

## package.json
- Pinned all dependency versions (removed `^` caret ranges) — all versions now exact
- Promoted `postcss` to direct dep (was implicit transitive); removed `overrides` section
- Fixed npm run scripts: use `--port NNNN` flag instead of `set PORT=NNNN &&`
- Several packages updated: next 16.2.4→16.2.9, react 19.2.4→19.2.7, zod 3→4, typescript 5→6, eslint 9→10

## .npmrc (new)
- Added `save-exact=true` so future `npm install` calls always pin exact versions

## src/app/layout.tsx
- Removed `max-w-7xl mx-auto px-4 py-6` from root `<main>` — owner pages were constrained/offset by it; each route now controls its own width

## src/app/page.tsx
## src/app/rankings/page.tsx
- Added `mx-auto w-full max-w-7xl px-4 py-6` wrapper div to restore previous width constraint on the two public-facing pages
