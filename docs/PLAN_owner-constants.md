# PLAN_owner-constants — next-bridge

## Title
Add /owner/constants page

## Plan
- [ ] **Prerequisite, executed in a separate nextjs-shared session (not this project)**: propose adding chess's `ConstantsViewer.tsx` (`src/ui/owner/ConstantsViewer.tsx` in the chess repo, for reference) to `nextjs-shared` — a generic, prop-driven, tabbed (Constants/.env/Functions) read-only viewer with no chess-specific logic (its only external dependency is a `VALUE_DISPLAY_MAX_LENGTH` number passed in, and `nextjs-shared/MyTab` directly instead of chess's thin `AppTab` wrapper). This project can only import it once it exists there; nothing below can be completed until then.
- [ ] Centralize scattered constants into `src/lib/constants.ts` first (per your decision, so the viewer launches with real content) — starting with `BRIDGE_CLUB_ID = 106` (currently a local `const` in `pipelineScrape.ts`). A full pass over the codebase is needed to find any other values that meet the project's own "would the user want to change this without changing the function's logic" test but aren't centralized yet — **the actual list and each value needs to be reviewed and agreed with you before `#code`**, per the standing rule that constant values are never invented mid-implementation.
- [ ] Add `VALUE_DISPLAY_MAX_LENGTH` to `constants.ts` — chess uses `40`; confirm whether next-bridge should use the same value or a different one before `#code`.
- [ ] Write `CONSTANTS_SECTIONS` — one section per logical grouping of next-bridge's actual constants (will be far shorter than chess's list today, given how few centralized constants currently exist), each entry with an accurate `description` and real `consumers` (file:function) found by an actual codebase pass, not guessed.
- [ ] Write `envSections` — next-bridge's real env vars (`CRON_SECRET`, `NEXT_PUBLIC_APPENV_ISDEV`, DB connection vars from `.env.locallocal`/`.env.localprod`, etc.), same description/consumers treatment.
- [ ] Write `FUNCTION_DESCRIPTIONS` — one-line description per function/module-scope reference appearing in any entry's `consumers` list (the Functions tab's reverse index) — mechanical but needs to stay in sync whenever a new consumer is added later, same maintenance cost chess's own file comments call out.
- [ ] Add `src/app/owner/constants/page.tsx` rendering the shared `ConstantsViewer` with the above data.
- [ ] Add a "Constants" tab to `OwnerPage`'s `tabs` array in `src/app/owner/page.tsx`, alongside Tools/Logging/Cache/Dataflow.

## Changes
