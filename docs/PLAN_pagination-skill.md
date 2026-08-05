# PLAN_pagination-skill — next-bridge

## Title
Create a /pagination skill and draft nextjs-shared documentation instructions for fetchFiltered/fetchTotalPages

## Plan
- [x] Create `~/.claude/skills/pagination/SKILL.md` — a new skill (Claude's own working file,
      allowed to write regardless of current project) triggered on requests like "add pagination",
      "paginate this list", "implement pagination". Follows the same operationalize-a-convention
      shape as the existing `db-naming`/`db-column-reorder` skills.
- [x] Draft the nextjs-shared documentation write-up **in chat, not written to any file** — project
      isolation means this session cannot edit `nextjs-shared` (including its vendored copy under
      `node_modules`). Correction found while researching this step: `fetchFiltered`/
      `fetchTotalPages` are **not** actually undocumented or unused — `nextjs-shared`'s own
      `CONSUMING_PROJECTS.md` already documents both with a working code example, and chess already
      uses them correctly (`src/lib/actions/games.ts`'s `fetchFilteredGames`/`getGamesPageCount` +
      `src/ui/games/GameList.tsx`). The real gap is narrower: there's no explicit anti-pattern
      warning telling people not to fetch a whole table and paginate/filter it client-side even
      when a pagination UI is already wired up — which is exactly how next-bridge's Home page ended
      up broken. The write-up (below, in this session's chat) proposes a short addition to the
      existing `fetchFiltered` section covering that specific anti-pattern, not a full rewrite.
- [x] Present the drafted write-up to the user in chat, for them to apply via a Claude Code session
      opened in the `nextjs-shared` project itself
- [x] Note: this plan does not fix next-bridge's actual Home page pagination bug — that fix is
      tracked separately as item 3 in `docs/PLAN_production-data-errors.md`

## Changes

### C:\Users\richa\.claude\skills\pagination\SKILL.md (new)
- New skill triggered on "add pagination"/"paginate this list"/"implement pagination" requests.
- Documents the rule: use `fetchFiltered` (rows) + `fetchTotalPages` (page count) together with an
  identical `Filter[]`, never a raw full-table `table_query`/`table_fetch` sliced client-side.
- Cites the next-bridge Home page incident (git history confirms no `LIMIT`/`OFFSET` ever existed
  in `/api/admin/players` or `getSessionsByYear`, since the earliest commit) as the motivating
  example, and chess's `GameList.tsx`/`games.ts` as a working reference implementation.
- Includes a step calling out the `table_query`(`isupdate: true`) cache-invalidation gap
  (per `nextjs-shared/CONSUMING_PROJECTS.md`'s "Functions with no cache awareness" table) as
  something to check whenever adding pagination to a table with existing writers.
- Checklist ends with a concrete verification step: confirm via network tab that the request size
  scales with page size, not total table size.

### nextjs-shared (not written — proposed only, see chat)
- No file in this repo was changed. A proposed addition to nextjs-shared's `CONSUMING_PROJECTS.md`
  was drafted and presented in chat for the user to apply from a session opened in that project.

## Testing
- [ ] Run `/pagination` (or ask Claude to "add pagination to X") in any project and confirm the
      skill loads and its instructions are followed
- [ ] Review the nextjs-shared write-up below and, if agreed, apply it from a Claude Code session
      opened in `nextjs-shared` — confirm it renders correctly in `CONSUMING_PROJECTS.md`
- [ ] No user-facing change in next-bridge itself to verify — this run only added a new Claude
      skill file and a proposed (unapplied) doc change; the actual Home page pagination bug fix is
      still pending in `docs/PLAN_production-data-errors.md` item 3
