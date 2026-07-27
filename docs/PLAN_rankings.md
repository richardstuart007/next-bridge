# PLAN_rankings — next-bridge

## Title
rankings

## Plan
- [x] Extend `activeTab` state in `HomePageClient.tsx` to include `'rankings'` alongside `'players'` / `'sessions'`
- [x] Add a third `MyTab` button labeled "Rankings" next to Players/Sessions, following the existing style/pattern
- [x] Add a third `<section>` (same CSS-hidden-when-inactive pattern as the other two tabs) that renders `RankingsPageClient`
- [x] Remove the standalone `/rankings` route (`src/app/rankings/page.tsx`) now that Rankings is reachable via the Home page tab
- [x] Wrap the root layout (`src/app/layout.tsx`) in nuqs's `NuqsAdapter` (one-time setup required by `nextjs-shared/useTabQueryState`)
- [x] Adopt `nextjs-shared/useTabQueryState` in `HomePageClient.tsx` for `activeTab`, syncing it to the URL as `?tab=players|sessions|rankings`, replacing the local `useState` + manual sessionStorage save/restore for that one piece of state (other filter state's sessionStorage persistence is untouched)
- [x] Verify `npx tsc --noEmit` + `npm run build`
- [x] Bug found during browser testing: `PlayerPageClient.tsx`/`SessionPageClient.tsx`'s hand-rolled `backPath` read effect (`sessionStorage.getItem(NB_BACK_FROM_KEY)` + `removeItem`, no double-invoke guard) silently breaks in dev under React Strict Mode — the effect's second (intentional, dev-only) invocation reads back `null` since the first invocation already cleared the key, wiping out the correct value and permanently suppressing the "← Back" link. Fix: replace both hand-rolled effects with `nextjs-shared/useBackNav(NB_BACK_FROM_KEY)`, which has the required `readRef` guard already built in.
- [x] Re-verify `npx tsc --noEmit` + `npm run build`
- [x] Re-test in browser: Rankings tab → click player → confirm "← Back" link appears and returns to `/?tab=rankings` with the Rankings tab active

## Changes
### src/ui/home/HomePageClient.tsx
- Imported `RankingsPageClient` from `@/src/ui/rankings/RankingsPageClient`
- Widened `activeTab` state type to `'players' | 'sessions' | 'rankings'`
- Added a third `MyTab` ("Rankings") next to Players/Sessions, same style classes as the existing two
- Added a third `<section>` after the Sessions section, hidden via the same `activeTab !== 'rankings' ? ' hidden' : ''` pattern as the other two tabs, rendering `<RankingsPageClient />` (self-contained — brings its own filters/state)

### src/app/rankings/page.tsx
- Deleted (and the now-empty `src/app/rankings/` directory) — Rankings is now reached via the Home page tab instead of a standalone route

### src/app/layout.tsx
- Wrapped the body content in nuqs's `NuqsAdapter` — required one-time setup so any component in the tree can use `nextjs-shared/useTabQueryState` (built on nuqs's `useQueryState`)

### src/ui/home/HomePageClient.tsx
- Replaced the local `useState<'players' | 'sessions' | 'rankings'>('players')` for `activeTab` with `useTabQueryState('tab', 'players')` from `nextjs-shared` — the active tab now lives in the URL as `?tab=players|sessions|rankings` instead of only in memory/sessionStorage
- Removed `activeTab` from the sessionStorage restore-on-mount effect and the save-on-change effect/dependency array (`home_state` in sessionStorage) — the URL now owns this, so the old sessionStorage round-trip for it was redundant. All other filter/pagination state's sessionStorage persistence is unchanged.

### src/app/page.tsx
- Wrapped `<HomePageClient />` in `<Suspense>` — required because `useTabQueryState` uses `useSearchParams` internally (via nuqs), and Next.js requires a Suspense boundary around any component using it on a statically-prerendered page, otherwise the build fails with "useSearchParams() should be wrapped in a suspense boundary"

### src/ui/player/PlayerPageClient.tsx
- Replaced the hand-rolled `backPath` state + read/clear `useEffect` (`sessionStorage.getItem(NB_BACK_FROM_KEY)` / `removeItem`) with `const backPath = useBackNav(NB_BACK_FROM_KEY)` from `nextjs-shared` — fixes a real dev-mode (React Strict Mode) bug where the old effect's double-invocation cleared the value before it could be used, permanently suppressing the "← Back" link

### src/ui/session/SessionPageClient.tsx
- Same fix as `PlayerPageClient.tsx` — replaced the hand-rolled `backPath` state + read/clear effect with `useBackNav(NB_BACK_FROM_KEY)`

## Testing
- [x] Start the app (`npm run locallocal`, port 4040) and open the home page — confirm a third "Rankings" tab appears next to Players/Sessions — **verified via automated browser test (Playwright)**
- [x] Click the Rankings tab and confirm the same Players/Partnerships rankings view (filters, sorting, search-highlight, tab counts) renders and loads data correctly, and the URL updates to `?tab=rankings` — **verified**
- [ ] Switch between Players/Sessions/Rankings tabs a few times and confirm each tab's state (filters, pagination) is preserved rather than reset — not covered by the automated test, please verify manually
- [x] Click a player or partnership row inside the Rankings tab, confirm it navigates to `/player/[id]`, confirm a "← Back" link (not just "⌂ Home") appears, and that clicking it returns to `/?tab=rankings` with the Rankings tab active — **verified**, and this surfaced/fixed the React Strict Mode `useBackNav` bug described above
- [ ] Confirm navigating directly to `/rankings` now 404s (route removed) — not covered by the automated test, please verify manually
- [ ] Confirm the same "← Back" behavior also works correctly from the Sessions tab → `/session/[id]` (only Rankings → `/player/[id]` was covered by the automated test; `SessionPageClient.tsx` got the identical `useBackNav` fix but wasn't separately driven through a browser)
