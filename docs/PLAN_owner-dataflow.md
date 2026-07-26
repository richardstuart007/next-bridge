# PLAN_owner-dataflow — next-bridge

## Title
Add /owner/dataflow page

## Plan
- [ ] **Prerequisite, executed in a separate nextjs-shared session (not this project)**: propose adding chess's markdown-lite parser/renderer to `nextjs-shared` — `src/lib/parseMarkdownLite.ts` (~364 lines) and `src/ui/MarkdownLiteView.tsx` (~516 lines) in the chess repo, for reference. Supports headings/sections/paragraphs/lists/code blocks, plus a custom "flow" block type (box-and-arrow diagrams) used to visualize pipelines. No chess-specific logic — genuinely reusable. This project can only import it once it exists there; nothing below can be completed until then.
- [ ] Author `docs/Dataflow.md` — next-bridge's own data-flow documentation (not copied from chess): staging tables (`ts1_sessions`, `ts2_results`) → build tables (`tse_sessions`, `tre_results`, `tpa_partners`) → stats tables (`ta1_player_stats`, `ta2_partner_stats`), the 5 pipeline steps (Scrape, Build Sessions, Build Results, Build Partners, Update Stats) and how they connect, using the markdown-lite "flow" syntax for the diagram(s). Real project documentation, not a Claude working file — content gets reviewed with you before being finalized, same as any other documentation change.
- [ ] Add `src/app/owner/dataflow/page.tsx` — server component (`readFile('docs/Dataflow.md')`, parse, render via the shared `MarkdownLiteView`), mirroring chess's `<div className='w-full p-6 md:p-8'>` wrapper.
- [ ] Add a "Dataflow" tab to `OwnerPage`'s `tabs` array in `src/app/owner/page.tsx`, alongside Tools/Logging/Cache (per your decision — a top-level tab, not a Tools-panel entry).

## Changes
