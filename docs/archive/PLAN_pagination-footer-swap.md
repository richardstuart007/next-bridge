# PLAN_pagination-footer-swap — next-bridge

## Title
Replace the local RowsPerPageSelect + MyPagination footer combo with nextjs-shared's new
MyPaginationFooter, across the Home page (Players + Sessions tabs), the Player page (history table
+ Partners tab), and the Session page. Rankings page excluded (no existing pagination to swap —
uses a client-side Top-N pattern instead; out of scope for this plan).

## Plan
- [x] Reinstall `nextjs-shared` to pull `MySelectRows`/`MyPaginationFooter` (only in `2.1.49`+,
      currently installed was `2.1.47`) — confirmed `2.1.49` now installed.
- [x] `src/ui/home/HomePageClient.tsx` — Players tab block (around line 357): replace the
      `<div className='mt-3 flex items-center gap-3'>` wrapping `RowsPerPageSelect` + a manual
      `p.{playerPage}/{totalPages}` label + `MyPagination` with a single `<MyPaginationFooter
      totalPages={...} statecurrentPage={playerPage} setStateCurrentPage={setPlayerPage}
      rowsPerPage={playerItemsPerPage} setRowsPerPage={v => { setPlayerItemsPerPage(v);
      setPlayerPage(1) }} rowsOptions={[15, 20, 50, 100]} />` — preserves the existing
      call-site-specific `options` override. The manual `p.X/Y` label is dropped (no equivalent
      slot in `MyPaginationFooter`; the page-number buttons already convey current position).
- [x] `src/ui/home/HomePageClient.tsx` — Sessions tab block (around line 476): same replacement,
      using `sessionPage`/`sessionItemsPerPage`/`setSessionPage`/`setSessionItemsPerPage`, default
      `rowsOptions` (no override here currently).
- [x] `src/ui/player/PlayerPageClient.tsx` (around line 671, `historyView === 'data'` block): same
      replacement using `currentPage`/`itemsPerPage`/`setCurrentPage`/`setItemsPerPage`.
- [x] `src/ui/player/PartnersTable.tsx` (around line 402, `view === 'data'` block): same
      replacement using its own `currentPage`/`itemsPerPage`/`setCurrentPage`/`setItemsPerPage`.
- [x] `src/ui/session/SessionPageClient.tsx` (around line 163): same replacement using its own
      `currentPage`/`itemsPerPage`/`setCurrentPage`/`setItemsPerPage`.
- [x] Update imports in all 4 files: remove `import { RowsPerPageSelect } from
      '@/src/ui/shared/RowsPerPageSelect'` and `import MyPagination from 'nextjs-shared/MyPagination'`,
      add `import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'`.
- [x] Delete `src/ui/shared/RowsPerPageSelect.tsx` — after this migration it has no remaining
      importers (confirmed: only these 4 files ever imported it).
- [x] **Follow-on cleanup (direct consequence, not a new decision):** removed the now-unused
      `ROWS_PER_PAGE_OPTIONS` constant from `src/lib/constants.ts` — its only consumer was the
      deleted `RowsPerPageSelect.tsx`.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### src/ui/home/HomePageClient.tsx
- Removed `RowsPerPageSelect`/`MyPagination` imports; added `MyPaginationFooter`. Both the Players
  tab and Sessions tab pagination footers now render a single `<MyPaginationFooter>` instead of a
  manual `RowsPerPageSelect` + `p.X/Y` label + `MyPagination` combo. Players tab preserves its
  `[15, 20, 50, 100]` rows-options override; Sessions tab uses the default.

### src/ui/player/PlayerPageClient.tsx
- Same swap for the player history table's pagination footer (data view only).

### src/ui/player/PartnersTable.tsx
- Same swap for the Partners tab's pagination footer.

### src/ui/session/SessionPageClient.tsx
- Same swap for the session results table's pagination footer.

### src/ui/shared/RowsPerPageSelect.tsx (deleted)
- No longer imported anywhere after the swap above.

### src/lib/constants.ts
- Removed `ROWS_PER_PAGE_OPTIONS` (dead code — its only consumer was the deleted
  `RowsPerPageSelect.tsx`). `ROWS_PER_PAGE` (the page-size default) is unaffected and still used.

## Testing
- [ ] User runs:
      npm run dev
- [ ] Home page: Players tab and Sessions tab both show a single yellow-background pagination
      footer (rows-per-page dropdown left, page controls centered) instead of the old separate
      row; changing rows-per-page resets to page 1 and re-slices the list; Players tab still offers
      `15/20/50/100` as options.
- [ ] Player detail page (`/player/[id]`): history table (data view) and Partners tab both show the
      new footer and behave the same as before (page navigation, rows-per-page change).
- [ ] Session detail page (`/session/[id]`): results table shows the new footer and behaves the
      same as before.
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly.
