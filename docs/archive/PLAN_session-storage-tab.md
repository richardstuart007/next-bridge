# PLAN_session-storage-tab — next-bridge

## Title
Add Session Storage tab to Owner page

## Plan
- [x] `src/app/owner/page.tsx`: import `OwnerTableSessionStorage` from `nextjs-shared` and add
      `{ label: 'Session Storage', content: <OwnerTableSessionStorage /> }` to the existing
      `tabs` array (currently `Data`, `Logging`, `Cache`, `Dataflow`, `Constants`).
- [x] Discovered mid-rollout: `nextjs-shared`'s `package.json` was missing the
      `./OwnerTableSessionStorage` exports entry (fixed in that project, version 2.1.60). Reinstalled
      `nextjs-shared` here to pull the fix.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### src/app/owner/page.tsx
- Added `Session Storage` tab to the existing `OwnerPage` tabs (`Data`, `Logging`, `Cache`,
  `Dataflow`, `Constants`), using `nextjs-shared/OwnerTableSessionStorage`.

### package.json / package-lock.json
- Reinstalled to pull `nextjs-shared@2.1.60` (adds the `OwnerTableSessionStorage` export).

## Testing
- [ ] User runs:
      npm run dev
- [ ] Open `/owner` — confirm a "Session Storage" tab appears alongside the existing tabs and
      renders without error.
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass.
