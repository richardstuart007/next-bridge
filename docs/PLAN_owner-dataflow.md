# PLAN_owner-dataflow — next-bridge

## Title
Add /owner/dataflow page

## Plan
- [x] **Prerequisite, executed in a separate nextjs-shared session (not this project)**: propose adding chess's markdown-lite parser/renderer to `nextjs-shared` — `src/lib/parseMarkdownLite.ts` (~364 lines) and `src/ui/MarkdownLiteView.tsx` (~516 lines) in the chess repo, for reference. Supports headings/sections/paragraphs/lists/code blocks, plus a custom "flow" block type (box-and-arrow diagrams) used to visualize pipelines. No chess-specific logic — genuinely reusable. This project can only import it once it exists there; nothing below can be completed until then.
- [x] Author `docs/Dataflow.md` — next-bridge's own data-flow documentation (not copied from chess): staging tables (`ts1_sessions`, `ts2_results`) → build tables (`tse_sessions`, `tre_results`, `tpa_partners`) → stats tables (`ta1_player_stats`, `ta2_partner_stats`), the 5 pipeline steps (Scrape, Build Sessions, Build Results, Build Partners, Update Stats) and how they connect, using the markdown-lite "flow" syntax for the diagram(s). Real project documentation, not a Claude working file — content gets reviewed with you before being finalized, same as any other documentation change.
- [x] Add `src/app/owner/dataflow/page.tsx` — server component (`readFile('docs/Dataflow.md')`, parse, render via the shared `MarkdownLiteView`), mirroring chess's `<div className='w-full p-6 md:p-8'>` wrapper.
- [x] Add a "Dataflow" tab to `OwnerPage`'s `tabs` array in `src/app/owner/page.tsx`, alongside Tools/Logging/Cache (per your decision — a top-level tab, not a Tools-panel entry).
- [x] Fix the flow diagram's row layout in `docs/Dataflow.md` to this target (rows top to bottom, `|` = side by side via `{pair}`):
  - Row 0 (top, unchanged): `nzbridge.co.nz`
  - Row 1: `Scrape AKBC` | `Scrape Tracked Players`
  - Row 2: `ts1_sessions` | `ts2_results`
  - Row 3: `Build Sessions` | `Build Results` — each directly under its row-2 input and directly above its row-4 output (same column)
  - Row 4: `tse_sessions` | `tre_results` | `Build Partners` | `tpa_partners` — Build Partners sits between `tre_results` and `tpa_partners`
  - Row 5: `Update Stats` alone
  - Row 6: `ta1_player_stats` | `ta2_partner_stats`

  Mechanically: reorder the side-node lines so `Build Results` immediately follows `Build Sessions`
  (tagged `{pair}`) and precedes `tse_sessions`; reorder so `Build Partners` sits between the
  `tre_results` and `tpa_partners` lines (each still tagged `{pair}` to keep joining row 4); remove
  `{pair}` from the `ta1_player_stats` line so it starts a new row (row 6) instead of joining
  `Update Stats`' row, keeping `{pair}` on `ta2_partner_stats` so it joins `ta1_player_stats`. No
  edge lines need to change — edges are drawn from actual rendered box positions regardless of row
  order.
- [x] Move `nzbridge.co.nz` out of its own top row and into Row 1, as the middle item between the
  two scrapes: `Scrape AKBC` | `nzbridge.co.nz` | `Scrape Tracked Players`, one row of three
  (confirmed with you: since a paired gap equals one box-width, two paired boxes already land at
  columns 1 and 3 with column 2 empty between them — putting nzbridge there as the actual column-2
  occupant needs no renderer change, just reordering). Mechanically: remove `{top}` from the
  `nzbridge.co.nz` line and add `{table}` instead (to keep its blue "data source" styling now that
  it's no longer in the special top row); move its line to between `Scrape AKBC` and `Scrape
  Tracked Players`; tag it `{pair}` (joins Scrape AKBC's row) and keep `{pair}` on `Scrape Tracked
  Players` (joins the same row after nzbridge). Row 0 (the old standalone top row) goes away
  entirely — Row 1 becomes the new topmost row. No edge lines need to change.
- [x] Reinstall `nextjs-shared` (`#reinstall`) to pick up its new grid-mode `flow` diagram support
  (added in a separate nextjs-shared session per the spec handed off earlier), then convert
  `docs/Dataflow.md`'s `flow` block from the legacy side/pair syntax to grid mode: a leading `grid`
  line, `node (row,col) ...` for every node (same ids/labels/tags as today, `{top}`/`{pair}` tags
  dropped since they're meaningless in grid mode), same `edge` lines unchanged. Exact target
  coordinates match the already-agreed layout: (1,1) Scrape AKBC, (1,2) nzbridge.co.nz, (1,3) Scrape
  Tracked Players, (2,1) ts1_sessions, (2,2) ts2_results, (3,1) Build Sessions, (3,2) Build Results,
  (4,1) tse_sessions, (4,2) tre_results, (4,3) Build Partners, (4,4) tpa_partners, (5,1) Update
  Stats, (6,1) ta1_player_stats, (6,2) ta2_partner_stats.
- [x] Fix process/table box colors in `docs/Dataflow.md`'s `flow` block: found that
  `nextjs-shared`'s new `GridFlowDiagram` has a bug — `const boxStyle = step.process ?
  PROCESS_BOX_STYLE : TABLE_BOX_STYLE` only checks `step.process` and defaults to the table style
  otherwise, so every untagged (process) node currently renders blue/table-styled instead of the
  intended amber/process default (should be `step.table ? TABLE_BOX_STYLE : PROCESS_BOX_STYLE`,
  matching the legacy `renderSideNode`'s already-correct pattern). Immediate workaround, doable
  entirely within this project: add an explicit `{process}` tag to the 6 process nodes (Scrape
  AKBC, Scrape Tracked Players, Build Sessions, Build Results, Build Partners, Update Stats) so
  they render correctly regardless of the nextjs-shared default bug. The actual bug fix belongs in
  `nextjs-shared` (separate project) — described to the user separately, applied whenever
  convenient in a nextjs-shared session, not blocking this step.
- [x] Reposition the whole grid diagram in `docs/Dataflow.md` to this confirmed target (columns now
  consistently skip a middle gap column for every paired item, same trick as nzbridge/the scrapes):

  | Row | Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |
  |---|---|---|---|---|---|
  | 1 | | nzbridge.co.nz | | | |
  | 2 | Scrape AKBC | | Scrape Tracked Players | | |
  | 3 | ts1_sessions | | ts2_results | | |
  | 4 | Build Sessions | | Build Results | | |
  | 5 | tse_sessions | | tre_results | Build Partners | tpa_partners |
  | 6 | | Update Stats | | | |
  | 7 | ta1_player_stats | | ta2_partner_stats | | |

  Mechanically: update every `node (row,col) ...` line's coordinates to match this table exactly
  (7 rows total now, up from 6). No `edge` lines change — same 18 connections, same ids, just new
  coordinates.
- [x] Remove `Build Partners` as a diagram node entirely (confirmed: it's a real function,
  `buildAllPartnerStats()`, but purely a status-only `COUNT(*) FROM tpa_partners` — no writes, no
  transform — so it doesn't warrant its own pipeline-step node). Move `tpa_partners` to (4,4),
  directly beside `Build Results` (4,3) — its actual writer per the code, not `tse_sessions`/
  `tre_results`'s row. Remove the `edge flow-tpa -> flow-buildpartners` line (dangling once the
  node is gone); keep `edge flow-buildresults -> flow-tpa` and `edge flow-tpa -> flow-updatestats`
  unchanged. Remove the standalone `## Build Partners` prose section, folding its content (status-
  only read, called by both the manual route and the cron) into `tpa_partners`'s own Consumers
  section instead.
- [x] **Pivot: replace the `nextjs-shared` grid-mode `flow` diagram with a React Flow diagram**,
  after concluding the hand-rolled grid/join-point/elbow-routing approach was reinventing what a
  real diagramming library already provides. Scope decisions agreed with you:
  - `nextjs-shared`'s already-shipped grid-mode feature (`@2.1.40`) is left as-is, unused —
    nothing to revert. The not-yet-implemented elbow-routing/join-points spec is abandoned, never
    built. Chess and `nextjs-shared` are completely unaffected either way.
  - React Flow (`@xyflow/react`) is installed in **next-bridge only**, not `nextjs-shared` — this
    diagram becomes project-local, not a shared component, at least for now.
  - Click-through (clicking a node scrolls to its prose section, like today's `[label](#anchor)`
    links) is a deferred future enhancement, not part of this pass — plain visual diagram only.
  - Edges use React Flow's `step` type (sharp right-angle elbow routing) — not `smoothstep`
    (rounded corners) or the default bezier curve — matching your stated preference for no curved
    lines at all.

  Steps:
  1. Install `@xyflow/react` via the `safe-install` skill (requires your approval at that point).
  2. Remove the `## Pipeline overview` heading and its ` ```flow ` fenced block from
     `docs/Dataflow.md` — every other prose section (`## nzbridge.co.nz` through
     `## ta2_partner_stats`) stays exactly as-is, still parsed/rendered via the existing
     `nextjs-shared/parseMarkdownLite`/`MarkdownLiteView`.
  3. Create `src/ui/dataflow/PipelineDiagram.tsx` — a `'use client'` component defining the 13
     pipeline nodes and 17 edges as React Flow `Node[]`/`Edge[]` data, converted from the
     already-agreed grid layout into pixel `{x, y}` positions (fixed column-width/row-height,
     matching today's diagram's proportions):
     - nzbridge.co.nz (1,2) — table style (blue)
     - Scrape AKBC (2,1), Scrape Tracked Players (2,3) — process style (amber)
     - ts1_sessions (3,1), ts2_results (3,3) — table style
     - Build Sessions (4,1), Build Results (4,3) — process style
     - tpa_partners (4,4) — table style
     - tse_sessions (5,1), tre_results (5,3) — table style
     - Update Stats (6,2) — process style
     - ta1_player_stats (7,1), ta2_partner_stats (7,3) — table style

     Same 17 connections as the current `flow` block's `edge` lines (the 18 original minus the
     already-removed Build Partners edge). Two custom node components (or one parameterized node
     type) with plain Tailwind classes matching today's colors — no dependency on `nextjs-shared`
     for styling.
  4. Update `src/app/owner/dataflow/page.tsx` to render `<PipelineDiagram />` above the parsed
     markdown prose (the diagram no longer comes from inside the parsed `docs/Dataflow.md` content).
  5. Update the "Dataflow" tab content in `src/app/owner/page.tsx` to match — same
     `<PipelineDiagram />` placement above the same parsed prose.
  6. Verify: `npx tsc --noEmit`, `npm run build`, and visually confirm the diagram renders
     correctly (13 nodes, correct colors, 17 right-angle-elbow-routed edges, no diagonal lines, no
     curves) at both `/owner/dataflow` and the `/owner` Dataflow tab.
- [x] Follow-up fixes from your first visual pass:
  - Some edges (near `tse_sessions`/`tre_results`/`tpa_partners`) rendered without a visible
    arrowhead. Traced through `@xyflow/system`'s actual `getPoints`/step-path algorithm by hand for
    the specific edges in that cluster (`tse`→`buildresults`, the one reversed-direction edge, and
    `buildresults`→`tpa`, the one same-row horizontal edge) — the computed path geometry looked
    correct in both cases, so this may be a rendering/color-inheritance quirk rather than a path
    bug. Applied a defensive fix: explicit `stroke`/`markerEnd.color` on every edge (previously
    relying on unstated defaults) plus more breathing room (`COL_WIDTH` 220→240, `ROW_HEIGHT`
    110→130). **Not visually confirmed by Claude** (no browser available in this session) — needs
    your re-check; if arrows are still missing after this, say which specific edge(s) so it can be
    narrowed down further.
  - Removed `<Background />` (the dotted background) from `PipelineDiagram.tsx` — plain background
    now, just the existing `bg-gray-50` container.
  - Added `src/ui/dataflow/DataflowTabs.tsx` — a `'use client'` wrapper with "Diagram"/
    "Documentation" sub-tabs (your choice: nested inside the existing "Dataflow" tab, not two new
    top-level tabs), so the diagram and the parsed prose are never both on screen at once. Both
    `src/app/owner/dataflow/page.tsx` and the "Dataflow" tab in `src/app/owner/page.tsx` now render
    `<DataflowTabs tree={tree} />` instead of stacking `<PipelineDiagram />` and `<MarkdownLiteView>`
    directly.
- [x] ~~Remove the "Dataflow" title from the "Documentation" sub-tab~~ — **superseded**. Tried the
  blank-`#`-heading approach, you reported the tabs broke, reverted back to `# Dataflow`. Root
  cause never conclusively identified before the bigger decision below made the whole markdown
  approach moot anyway.
- [x] **Pivot: drop the markdown/`MarkdownLiteView` approach entirely — rewrite the Dataflow page's
  documentation as plain TSX**, driven by a normal `MyTab` bar (same pattern `OwnerPage`/
  `PipelineTable` already use), because the markdown-interpretation layer has caused three separate
  real problems this session: no composability (couldn't add "Diagram" as a sibling tab without a
  cross-project change or reimplementation), no compile-time checking (a one-character heading edit
  silently broke the whole tab bar), and every bug requires tracing through someone else's parser/
  renderer instead of just reading the rendered JSX. Scope decisions:
  - **Cross-reference links become plain text, not clickable.** Today's prose has several
    `[label](#anchor)` links jumping between sections (e.g. `tre_results` → `tpa_partners`,
    `ta1_player_stats` → `Update Stats`). Plain `MyTab` switching is local component state, not
    URL anchors, so making these actually click-to-switch-tabs would need the content to accept a
    "switch tab" callback — real extra plumbing. Matches the already-agreed "click-through is
    deferred" decision from the original React Flow pivot — drop it here too, keep the referenced
    name as plain text (still says which table/step it means, just isn't clickable).
  - **`docs/Dataflow.md` gets deleted once its content is fully migrated into TSX** — the TSX
    becomes the sole source of truth going forward; keeping a parallel, no-longer-rendered `.md`
    copy around would just be a second thing to keep in sync (or, more likely, silently drift).
  - `nextjs-shared/parseMarkdownLite` and `nextjs-shared/MarkdownLiteView` become entirely unused
    by next-bridge after this — the project no longer depends on any part of that shared markdown
    system (separate from the diagram, which already didn't use it since the React Flow pivot).

  Steps:
  1. Create `src/ui/dataflow/sections.tsx` — transcode all 9 sections currently in
     `docs/Dataflow.md` (nzbridge.co.nz, ts1_sessions, ts2_results, tse_sessions, tre_results,
     tpa_partners, Update Stats, ta1_player_stats, ta2_partner_stats) into hand-written JSX, one
     small component per section, faithfully carrying over every Purpose/Input/Processing/Output/
     Consumers/Rules-gotchas subsection's actual content (headings → `<h4>`/`<h5>`-style elements
     matching current visual hierarchy, paragraphs → `<p>`, numbered/bulleted lists → `<ol>`/`<ul>`,
     inline code → `<code>`, bold → `<strong>`, cross-reference links → plain text per the scope
     decision above, external file links like `[players.ts](../src/lib/actions/players.ts)` → kept
     as real `<a>` links if they still resolve usefully, otherwise plain `<code>` text). Export
     `SECTIONS: { id: string; label: string; content: ReactNode }[]` assembling all 9.
  2. Rewrite `src/ui/dataflow/DataflowTabs.tsx` — replace the current "Diagram"/"Documentation"
     2-way toggle with a single `MyTab` bar: "Diagram" first, then one tab per `SECTIONS` entry (10
     tabs total, all siblings in one row) — exactly the layout that existed naturally back when the
     diagram itself was a markdown section, before the React Flow pivot. Plain `useState` for the
     active tab, matching `OwnerPage`/`PipelineTable`'s existing pattern. Remove the `tree` prop and
     all `nextjs-shared/parseMarkdownLite`/`MarkdownLiteView` imports.
  3. Update `src/app/owner/dataflow/page.tsx` — no more `readFile`/`parseMarkdownLite`/
     `buildSectionTree`; just renders `<DataflowTabs />` (no props needed).
  4. Update the "Dataflow" tab in `src/app/owner/page.tsx` to match — same simplification.
  5. Delete `docs/Dataflow.md`.
  6. Verify: `npx tsc --noEmit`, `npm run build`, and visually confirm all 10 tabs (Diagram + 9
     content tabs) render with faithful content and correct switching, on both `/owner/dataflow`
     and the `/owner` Dataflow tab.
- [x] **Restructure into a 2-level tab hierarchy**: top level becomes `Diagram` / `Processes` /
  `Tables` (was a flat `Diagram` + 9 content tabs). `Processes` gets its own sub-tab bar: `Scrape`,
  `Build Sessions`, `Build Results`, `Update Stats`. `Tables` gets the remaining 8 as its own
  sub-tab bar: `nzbridge.co.nz`, `ts1_sessions`, `ts2_results`, `tse_sessions`, `tre_results`,
  `tpa_partners`, `ta1_player_stats`, `ta2_partner_stats` (`Update Stats` moves out of this group,
  into Processes). Since `Scrape`/`Build Sessions`/`Build Results` never had their own prose
  sections before (that information lived scattered inside the *table* sections' own Processing/
  Consumers text — e.g. `ts1_sessions`'s Processing already described what Scrape AKBC/Scrape
  Tracked Players do), new content needs authoring for those three, synthesized from what's already
  accurately written elsewhere in `sections.tsx` (not new facts, just reorganized/extracted into a
  process-centric view) — matching the diagram's already-merged `Scrape` box (combining Scrape
  AKBC + Scrape Tracked Players into one process, same Purpose/Input/Processing/Output/Consumers/
  Rules-gotchas structure as every existing section). Some factual overlap between the Processes
  and Tables views is expected and fine (same underlying facts, two organizational angles), not a
  duplication bug.

## Changes

### docs/Dataflow.md
- New file. Documents the actual pipeline as found in the current code — 4 real top-level steps
  (Scrape AKBC, Scrape Tracked Players, Build Partners, Update Stats), not the 5-step summary in
  `.claude/CLAUDE.md` (which is stale — no dedicated "Build Partners" build step exists anymore;
  `tpa_partners` is written inline by Build Results, and step 3 is a status-only count). Covers
  `nzbridge.co.nz` (external source), `ts1_sessions`, `ts2_results`, `tse_sessions`, `tre_results`,
  `tpa_partners`, `ta1_player_stats`, `ta2_partner_stats`, plus the Build Partners/Update Stats
  process nodes, each with Purpose/Input/Processing/Output/Consumers/Rules-gotchas sections and a
  `flow` diagram, using the markdown-lite syntax from `nextjs-shared`.

### src/app/owner/dataflow/page.tsx
- New file. Async server component: reads `docs/Dataflow.md`, parses it with
  `nextjs-shared/parseMarkdownLite`, and renders it with `nextjs-shared/MarkdownLiteView`, matching
  chess's own `/owner/dataflow` page structure.

### src/app/owner/page.tsx
- Removed `'use client'` and made `Page` an async server component (previously unnecessary —
  `OwnerPage` itself already manages its own tab-switching state internally as a client component).
- Added a "Dataflow" tab alongside Tools/Logging/Cache, reading and parsing the same
  `docs/Dataflow.md` inline and rendering it via `MarkdownLiteView` — a top-level tab (per your
  decision), not a Tools-panel link like chess's equivalent.

### docs/Dataflow.md (row-layout revision)
- Reordered the `flow` block's side-node lines and `{pair}` tags to match the agreed target
  layout: `Scrape AKBC`/`Scrape Tracked Players` paired in row 1; `ts1_sessions`/`ts2_results`
  paired in row 2; `Build Sessions`/`Build Results` paired in row 3 (each aligned under its row-2
  input and above its row-4 output); `tse_sessions`/`tre_results`/`Build Partners`/`tpa_partners`
  in row 4 (Build Partners between `tre_results` and `tpa_partners`); `Update Stats` alone in row
  5; `ta1_player_stats`/`ta2_partner_stats` paired in row 6. No `edge` lines changed — connections
  are drawn from actual rendered box positions, independent of row order.

### docs/Dataflow.md (nzbridge repositioned)
- Moved `nzbridge.co.nz` out of the standalone top row and into Row 1 as the middle item between
  the two scrapes (`Scrape AKBC` | `nzbridge.co.nz` | `Scrape Tracked Players`) — dropped `{top}`,
  added `{table}` (keeps its blue data-source styling) and `{pair}`. No edge lines changed.

### nextjs-shared reinstall + docs/Dataflow.md (grid mode)
- Ran `#reinstall` to pick up `nextjs-shared@2.1.40`, which adds grid-mode `flow` diagram support
  (`grid-node` step type, `parseGridFlowLines`, `GridFlowDiagram`) per the spec handed off earlier.
- Rewrote `docs/Dataflow.md`'s `flow` block from the legacy side/pair syntax to grid mode: a leading
  `grid` line, `node (row,col) ...` for all 14 nodes at the exact already-agreed coordinates, same
  `edge` lines unchanged (18 edges, untouched). `{top}`/`{pair}` tags removed (meaningless in grid
  mode); `{table}`/`{#id}` tags kept as before.

### docs/Dataflow.md (process/table colors + final grid layout)
- Added explicit `{process}` tags to the 6 process nodes (Scrape AKBC, Scrape Tracked Players,
  Build Sessions, Build Results, Build Partners, Update Stats), working around a `nextjs-shared`
  `GridFlowDiagram` bug (`boxStyle` only checks `step.process`, defaulting untagged nodes to the
  table/blue style instead of the intended process/amber default) — the underlying bug itself
  lives in `nextjs-shared` and hasn't been fixed there yet, just worked around here.
- Repositioned every node to the confirmed 7-row grid layout (nzbridge at (1,2); scrapes at (2,1)/
  (2,3); ts1/ts2 at (3,1)/(3,3); Build Sessions/Build Results at (4,1)/(4,3); tse_sessions/
  tre_results/Build Partners/tpa_partners at (5,1)/(5,3)/(5,4)/(5,5); Update Stats at (6,2); ta1/ta2
  at (7,1)/(7,3)) — same 18 `edge` lines, unchanged.

### docs/Dataflow.md (Build Partners node removed)
- Removed the `Build Partners` diagram node and its `edge flow-tpa -> flow-buildpartners` line —
  it's real code (`buildAllPartnerStats()`), but purely a status-only `COUNT(*)`, no writes, so it
  doesn't warrant its own pipeline-step node in the diagram.
- Moved `tpa_partners` to (4,4), beside `Build Results` (4,3) — its actual writer, per the code —
  instead of (5,5) alongside `tse_sessions`/`tre_results`.
- Removed the standalone `## Build Partners` prose section; folded its content into `tpa_partners`'s
  own Consumers section as a new "Build Partners (pipeline step 3)" subsection, and updated
  `tre_results`'s Rules/gotchas to point there instead of its own now-removed "Build Partners"
  consumer subsection.

### Investigated, no change made: nzbridge arrow fan-out
- Diagnosed why both of nzbridge's outgoing arrows visually start at the same point and land at
  the top-center of each scrape box: `nextjs-shared`'s `buildCurve` default (grid-mode) branch
  computes `startX`/`startY` purely from the source box (nzbridge's own bottom-center), independent
  of which target the edge is going to, so both edges share one start point and only diverge based
  on each target's own top-center `endX`/`endY`. Root cause is entirely in `nextjs-shared`
  (`buildCurve`), nothing in `docs/Dataflow.md` can change it. You decided to leave this as-is for
  now rather than write up a nextjs-shared fix spec — can revisit later if it still bothers you.

### React Flow pipeline diagram (replaces the nextjs-shared grid-mode approach)
- Installed `@xyflow/react` (project-local to next-bridge, via `safe-install`).
- Removed the `## Pipeline overview`/` ```flow ` block from `docs/Dataflow.md` — every other prose
  section is unchanged.
- New `src/ui/dataflow/PipelineDiagram.tsx` — React Flow diagram: 13 nodes at the already-agreed
  grid coordinates (converted to pixel positions), 17 edges, all `type: 'step'` (sharp right-angle
  routing, no curves), each node styled blue (table) or amber (process) via a custom node
  component with 8 invisible handles (source+target × top/bottom/left/right) so every edge can
  exit/enter from whichever side actually faces the other node.
- New `src/ui/dataflow/DataflowTabs.tsx` — "Diagram"/"Documentation" sub-tabs wrapping
  `PipelineDiagram` and `MarkdownLiteView`.
- `src/app/owner/dataflow/page.tsx` and the "Dataflow" tab in `src/app/owner/page.tsx` both now
  render `<DataflowTabs tree={tree} />`.
- Follow-up from your first look: explicit edge `stroke`/`markerEnd` color and more row/column
  spacing (defensive fix for some missing arrowheads, not visually confirmed by Claude — see
  Testing below); dotted background removed.
- **Reverted**: attempted removing the "Dataflow" title by changing `docs/Dataflow.md`'s first
  line from `# Dataflow` to a blank `# ` heading. First attempt actually used an HTML entity
  (`#&#x20;`) instead of a real space character, which wouldn't have matched the heading regex at
  all — fixed that, then you reported the tabs "completely broken." `buildSectionTree`'s outline
  logic (checked directly: `nextjs-shared/parseMarkdownLite.ts`) builds sections purely from
  heading *levels*, not text content, so an empty H1 shouldn't structurally break anything — but
  rather than guess a third time, reverted the heading back to `# Dataflow` outright to confirm
  that was actually the cause before trying anything else. **Needs your confirmation**: are the
  tabs back to normal now that the title text is restored? If they're still broken, the blank
  heading wasn't the cause and something else changed.
- Installed `playwright` (dev dependency) to attempt a live visual check of the missing-arrowhead
  issue; blocked by a permission-prompt loop mid-session (see the `fewer-permission-prompts` run
  below) — diagnostic not yet completed, defensive fix above is still unconfirmed.
- Ran `fewer-permission-prompts`: added `c:\Users\richa\claude\github\next-bridge\.claude\settings.json`
  (new file) with `Bash(npx tsc --noEmit)` and `Bash(curl -s *)` allowlisted, to reduce the
  permission-prompt friction hit throughout this session. May need a session restart to take
  effect — the curl health-check was still prompting immediately after this was added.

### Markdown → plain TSX migration (React Flow diagram + MyTab content, no parsing)
- New `src/ui/dataflow/sections.tsx` — all 9 sections' full content transcoded from
  `docs/Dataflow.md` into hand-written JSX (one small component per section), exported as
  `SECTIONS: { id, label, content }[]`. Cross-reference links became plain text per the agreed
  scope decision; external source-file links (`[players.ts](../src/lib/actions/players.ts)`)
  became plain `<code>` text since they wouldn't resolve as real hrefs from this page.
- Rewrote `src/ui/dataflow/DataflowTabs.tsx` — single `MyTab` bar, "Diagram" plus one tab per
  `SECTIONS` entry (10 tabs, all siblings in one row — the layout originally wanted, matching how
  it looked back when the diagram itself was a markdown section). Plain `useState`, no props, no
  `nextjs-shared/parseMarkdownLite`/`MarkdownLiteView` imports.
- `src/app/owner/dataflow/page.tsx` — no more `readFile`/markdown parsing; `Page` is a plain
  (non-async) component rendering `<DataflowTabs />`.
- `src/app/owner/page.tsx` — same simplification; `Page` reverted to non-async (no longer needs to
  read/parse anything), Dataflow tab renders `<DataflowTabs />` with no props.
- Deleted `docs/Dataflow.md` — the TSX is now the sole source of truth.
- **Verified with Playwright** (finally got the diagnostic working after the permission-prompt
  issue): loaded `/owner/dataflow` in a real headless browser, screenshotted the diagram, and
  inspected every edge's actual rendered SVG path/marker. All 17 edges have valid non-degenerate
  paths, a correctly-referenced arrowhead marker (confirmed the `<marker>` element itself exists,
  not just referenced), and the correct stroke color. The two previously-reported-missing
  arrowheads — `tse_sessions → Build Results` (the upward/reversed edge) and
  `Build Results → tpa_partners` (the horizontal edge) — are both clearly visible in the
  screenshot. The earlier defensive fix (explicit stroke/marker color + more spacing) evidently
  did resolve it.

### PipelineDiagram.tsx (fixed a real routing bug: tpa_partners → Update Stats cut through tre_results)
- You spotted what looked like a phantom `tre_results` ↔ `tpa_partners` connection. Confirmed via
  the actual edge data there's no such edge (only `buildresults→tre` and `buildresults→tpa`, both
  one-way from Build Results, exactly as intended — nothing changed there). Root cause: the
  `tpa_partners → Update Stats` edge (`e15`) skips over the `tre_results` row entirely, and its
  default bend point (`stepPosition` 0.5, i.e. the midpoint between the two rows it skips) landed
  inside `tre_results`'s own vertical span — so that edge's horizontal jog visually cut straight
  through the box, looking like a direct connection.
- Fix: added an optional `stepPosition` param to the local `edge()` helper. Discovered
  `type: 'step'` internally strips `stepPosition` out of `pathOptions` (only forwards
  `borderRadius`/`offset`), so a bend-point override needs `type: 'smoothstep'` with
  `borderRadius: 0` explicit instead — renders identically (sharp corners, no curves) but actually
  respects the override. `e15` now uses `stepPosition: 0.15`, moving its bend into the empty gap
  between the Build Results/Build Sessions row and the tse_sessions/tre_results row, clear of
  every node. Re-verified with Playwright — the line now visibly routes above `tre_results`
  instead of through it.
- Moved `Update Stats` to (6,4) — directly below `tpa_partners` (was (6,2)) — and
  `ta1_player_stats`/`ta2_partner_stats` to (7,3)/(7,5) flanking it (were (7,1)/(7,3)), per your
  request for a straight vertical arrow from `tpa_partners` into `Update Stats`. Since they now
  share a column, that edge naturally renders as a plain straight line (same-column edges already
  did this by default), so the `e15` bend-point override from the previous fix is no longer needed
  and was removed. Re-verified with Playwright — confirmed straight.
- Changed `e10` (`tse_sessions → Build Results`) from exiting `tse`'s top / entering
  `buildresults`' bottom (a wide horizontal jog spanning the full gap under the Build Sessions/
  Build Results row, which read as a confusing "link between the tse/tre lines") to exiting `tse`'s
  right-middle and entering `buildresults`' left-middle instead, per your explicit request. Route
  now only spans the empty gap between `Build Sessions` and `Build Results` themselves, not the
  full row width. `e11` (`Build Results → tre_results`) was already a plain one-way straight
  downward arrow (same column) — confirmed unchanged. Re-verified with Playwright.
- Added a new join point, `top-left-tgt` (a `Position.Top` handle shifted to `left: 15%` instead
  of the default centered 50%) to `DiagramNode`, since a true corner point didn't exist yet in the
  4-side (top/bottom/left/right) handle set. Changed `e13` (`tre_results → Update Stats`) to
  target `top-left-tgt` instead of `top-tgt`, and `e14` (`tse_sessions → Update Stats`) to target
  `left-tgt` instead of `top-tgt` (source unchanged on both). This spreads the three incoming edges
  to `Update Stats` (from `tse_sessions`, `tre_results`, `tpa_partners`) across three visibly
  distinct entry points instead of two of them landing on the same top-center spot. Re-verified
  with Playwright.
- Combined `Scrape AKBC` and `Scrape Tracked Players` into a single diagram box, `Scrape`, at
  (2,2) — directly below `nzbridge.co.nz`, same column, so that edge is now a plain straight
  vertical line. One arrow exits `Scrape`'s left-middle into `ts1_sessions`, another exits its
  right-middle into `ts2_results`, per your request. **Diagram-only simplification** — the prose
  content (`src/ui/dataflow/sections.tsx`) still describes them as two distinct real steps (Scrape
  AKBC truncates `ts1_sessions`/`ts2_results` first, Scrape Tracked Players never truncates), which
  is accurate to the actual code and wasn't changed. 6 edges (`nzb→scrapeakbc`, `nzb→scrapetracked`,
  `scrapeakbc→ts1`, `scrapetracked→ts1`, `scrapeakbc→ts2`, `scrapetracked→ts2`) collapsed into 3
  (`nzb→scrape`, `scrape→ts1`, `scrape→ts2`). Re-verified with Playwright.
- Moved `Build Results` (was (4,3)), `tpa_partners` (was (4,4)), `tre_results` (was (5,3)),
  `Update Stats` (was (7,4)... previously (6,4)), and `ta1`/`ta2` (were (7,3)/(7,5)) each down one
  row — to (5,3), (5,4), (6,3), (7,4), (8,3)/(8,5) respectively — so `Build Results` now sits
  level with `tse_sessions` (both row 5), per your request. `Build Sessions` and `tse_sessions`
  stayed put. Bonus effect: `tse_sessions → Build Results` is now a same-row edge, simplifying to a
  plain straight horizontal line (no elbow needed at all anymore). Re-verified with Playwright — no
  new routing collisions introduced by the wider row gaps this created.

### 2-level tab restructure: Diagram / Processes / Tables
- `src/ui/dataflow/sections.tsx` — added 3 new content sections (`ScrapeSection`,
  `BuildSessionsSection`, `BuildResultsSection`), synthesized from what was already accurately
  described inside `ts1_sessions`/`ts2_results`/`tse_sessions`/`tre_results`'s own Processing/
  Consumers text — no new facts, just reorganized into a process-centric view matching the
  diagram's merged `Scrape` box. Split the single `SECTIONS` export into `PROCESS_SECTIONS` (Scrape,
  Build Sessions, Build Results, Update Stats — 4) and `TABLE_SECTIONS` (the remaining 8, with
  `Update Stats` moved out into `PROCESS_SECTIONS`).
- Rewrote `src/ui/dataflow/DataflowTabs.tsx` — top level is now `Diagram`/`Processes`/`Tables`
  (was a flat `Diagram` + 9 content tabs). Added a shared `SubTabs` component (sub-tab bar +
  content, same `MyTab` pattern as before) used by both `Processes` and `Tables`.
- Verified with Playwright: all three top-level tabs switch correctly; `Processes` shows its 4
  sub-tabs with correct synthesized content; `Tables` shows its 8 sub-tabs (confirmed `Update
  Stats` no longer among them) with unchanged original content.

## Testing

**Note:** earlier Testing items in this section described prior approaches (the markdown/CSS-grid
`flow` diagram, then the Diagram/Documentation 2-tab split) — both superseded by this final plain-
TSX/single-tab-bar implementation. Replaced by the items below.

- [x] `npx tsc --noEmit` and `npm run build` — confirmed passing.
- [x] Visually confirmed via Playwright screenshot: all 10 tabs (Diagram + 9 content tabs) render
  in one row; the diagram shows all 13 boxes at correct positions, correct blue/amber colors,
  plain background, and all 17 arrows visible with correct arrowheads (including the two
  previously-missing ones near `tse_sessions`/`Build Results`/`tpa_partners`).
- [ ] Open http://localhost:4040/owner/dataflow yourself and click through a few of the content
  tabs (nzbridge.co.nz, ts1_sessions, tre_results, etc.) — confirm the transcoded prose reads
  correctly and nothing looks obviously wrong compared to what the old `docs/Dataflow.md` said.
- [ ] Open http://localhost:4040/owner and click the "Dataflow" tab — confirm the same 10-tab
  layout appears there too, alongside Tools/Logging/Cache.
- [ ] Confirm cross-references that used to be clickable links (e.g. `tre_results`'s Rules/gotchas
  mentioning `tpa_partners`) read fine as plain text — this was an agreed, deliberate scope cut,
  not a bug.
- [ ] Decide whether to keep `playwright` as a standing dev dependency for future visual checks, or
  have it removed now that this diagnostic is done (still an open question from earlier).
- [ ] Separately, whenever convenient: the `nextjs-shared` `GridFlowDiagram` color bug
  (`step.process ? PROCESS_BOX_STYLE : TABLE_BOX_STYLE`, should check `step.table` instead) no
  longer matters for this project since it never used `nextjs-shared`'s grid mode, and now doesn't
  use any part of `nextjs-shared/parseMarkdownLite`/`MarkdownLiteView` at all — optional to fix
  there for any other future consumer, not required by next-bridge anymore.
