# PLAN_adopt-shared-devlayoutheader — next-bridge

## Title
Adopt shared DevLayoutHeader (nextjs-shared@2.1.37)

## Plan
- [x] User runs:
  Remove-Item -Recurse -Force node_modules
- [x] User runs:
  Remove-Item -Force package-lock.json
- [x] User runs:
  npm install
- [x] User runs:
  Remove-Item -Recurse -Force .next
- [x] User runs:
  npx tsc --noEmit
- [x] In src/app/layout.tsx, replace `import { DevHeader } from '@/src/ui/DevHeader'` with `import { DevLayoutHeader } from 'nextjs-shared/DevLayoutHeader'`
- [x] In src/app/layout.tsx, change `<DevHeader dbLocation={DB_LOCATION} />` to `<DevLayoutHeader dbLocation={DB_LOCATION} />`, leaving the existing `{IS_DEV && ...}` wrapper as-is (harmless double-guard with DevLayoutHeader's internal `NEXT_PUBLIC_APPENV_ISDEV` self-gating, not a behavior change); omit `extraLinks` (defaults to `[]`, matching current no-extra-links behavior)
- [x] Delete src/ui/DevHeader.tsx (now unused)
- [x] User runs:
  npx tsc --noEmit
- [x] User runs:
  npm run build

## Changes
### node_modules / package-lock.json
- Clean reinstall (`node_modules`, `package-lock.json`, `.next` removed, then `npm install`) to pick up `nextjs-shared@2.1.37`, which now exports `DevLayoutHeader`.

### src/app/layout.tsx
- Replaced the local `DevHeader` import/usage with the shared `DevLayoutHeader` from `nextjs-shared/DevLayoutHeader`. Kept the existing `{IS_DEV && ...}` wrapper as-is (harmless double-guard with the component's own internal gating). Did not pass `extraLinks`, so it defaults to `[]` — same no-extra-links behavior as before.

### src/ui/DevHeader.tsx
- Deleted — no longer used anywhere in the project now that layout.tsx uses the shared component.

## Testing
- [ ] Run the dev server (npm run locallocal) and open any page with NEXT_PUBLIC_APPENV_ISDEV=true — confirm the dev header still renders at the top with the correct DB location, same as before
- [ ] Confirm no extra nav links appear in the header (since extraLinks was omitted, defaulting to [])
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both passed cleanly with no errors
