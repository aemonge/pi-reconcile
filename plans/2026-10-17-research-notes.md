# Research Notes — pi-reconcile (2026-10-17)

Evidence base for `plan-a-iron.md`, `plan-b-engine.md`, `plan-c-orchestrator.md`.
Every fact below was verified on this machine or against the cited source.
Facts marked **[empirical]** were reproduced in `/tmp` scratch dirs;
**[pkg]** = read from the installed package source; **[web]** = project docs.

---

## 1. Pi extension API (the real surface, not the four events we use)

Source: `@earendil-works/pi-coding-agent@1.3.0`, unpacked at
`~/.local/share/pnpm/global/v11/aaa5-*/node_modules/.pnpm/@earendil-works+pi-coding-agent@1.3.0_*/…/pi-coding-agent`
(**[pkg]** `dist/core/extensions/types.d.ts:1186-1227`). Abbreviate as `<pkg>`.

- **41 subscribable events**, not 4. Ones that matter to us:
  - `turn_end` (`:833-841`) — payload extends `BoundaryState` with
    `toolResults`, returns `BoundaryResult`. Finer boundary than `agent_end`.
  - `agent_before_settle` (`:796-799`) — the **last actionable** boundary of a
    run; `agent_settled` (`:801-805`) is notification-only/final.
  - `agent_end` (`:748-751`) — fires **once per agent loop**; automatic
    retries start a *new* loop → another `agent_end` (agent-session.js:888-890).
  - `session_shutdown` (`:636-642`) — fires with `reason:
    "quit"|"reload"|"new"|"resume"|"fork"`, **not only process exit**
    (agent-session-runtime.js:296-300, agent-session.js:2969-2972).
    Our current code treats it as "final" — on session switches it fires too.
  - `tool_result` (`:985-1033`) — payload has `toolName`… actually per-tool
    unions keyed by `toolCallId/toolName`, plus `isError`, `usage`. A result
    **handler may rewrite results** (`:1114-1120`) — we only read.
  - `resources_discover` (`:551-562`) — lets an extension *offer* skill/prompt
    paths. `mcp_servers_change` (`:566-570`) — we can observe when
    gentle-engram's MCP server registers/unregisters.
- **Handlers**: all awaited, sequential, in registration order
  (`<pkg>/dist/core/extensions/runner.js:813-840`). Our `applyBoundaries`
  I/O at `agent_end` therefore delays settle by its (small) duration.
- **`registerCommand`** (`types.d.ts:1171-1177`): handler
  `(args: string, ctx) => Promise<void>` — **may not return text**; output only
  via `ctx.ui.notify`. `getArgumentCompletions` exists for subcommand
  completion. Our current usage is correct.
- **`ExtensionContext`** (`:213-262`): beyond `cwd/hasUI/ui.notify` we get
  `mode`, `sessionManager`, `signal`, `abort()`, `getContextUsage()`,
  `compact()`, and UI extras: `ui.setWidget`, `ui.setStatus`, `ui.custom`
  (`~:106`) — usable for a persistent status surface.
- **No `pi-durable`, no `beforeTool` extension event exists in 1.3.0**
  (grep across docs+dist: zero hits; internal `agent.beforeToolCall` hooks are
  not extension-subscribable — agent-session.js:323-324). The README's
  "pi-durable migration path" is speculative; no public artifact to target.

## 2. Extension loading & distribution (corrects our README)

**[pkg]** `dist/core/extensions/loader.js:677-699`, `docs/packages.md`,
`dist/core/package-manager.js`:

- Scan order: `<cwd>/.pi/extensions/` → `~/.pi/agent/extensions/` → explicit
  `--extension/-e` paths. One level deep, no recursion (loader.js:630).
- Accepted forms: direct `*.ts|*.js` file; subdir with `index.ts|index.js`;
  subdir whose `package.json` has a **`pi` manifest**
  (`pi.extensions: [...]`) — **`package.json` "main" is ignored**.
- Raw TypeScript is loaded via jiti — no build step needed (docs/extensions.md:47).
- `pi install npm:<pkg>` runs npm install into `~/.pi/agent/npm/` (user scope)
  or `.pi/npm/` (project), and appends to `packages` in settings.json.
- **Consequence for pi-reconcile**: current `package.json` (`main: index.ts`,
  no `pi` field) loads fine via `--extension ./pi-reconcile` or as a cloned
  dir (index.ts convention) but **would not load as an installed npm pi
  package**. Distribution fix = add `"pi": { "extensions": ["index.ts"] }`.

Local evidence (**[emp]** `~/.pi/agent/settings.json`): user's active
`packages` include `npm:graphify-pi`, `npm:gentle-engram`,
`npm:@aemonge-dev/pi-openspec-gate`, `npm:@aemonge-dev/pi-stardeck` — i.e.
the gate is itself a distributed pi package, and gentle-engram (official
Engram Pi package) is already present (plugin/pi/README.md **[web]**).

## 3. graphify CLI (v0.9.85, Python) — verified behavior

**[emp]** in `/tmp/gfx-test` (2–3 file repo):

- `graphify update .` works: **2.5s cold, 0.7s incremental**, no LLM, no API
  key. Writes `graphify-out/{graph.json, graph.html, GRAPH_REPORT.md,
  manifest.json, cache/}`.
- **No-op update leaves outputs untouched** ("No code-graph topology changes
  detected; outputs left untouched") → `graph.json` mtime unchanged →
  *our mtime staleness check keeps reporting stale after a touch-only change*.
  Content changes do rewrite it (verified). Cooldown currently masks this.
- `needs_update` marker: **written by the watch layer for doc/paper/image
  changes** — "semantic re-extraction pending" (**[pkg]** graphify
  `watch.py:2536,2593,2605`). `update` (AST-only) **does not clear it**; it is
  a signal that an LLM pass (`graphify extract` / skill `/graphify --update`)
  is owed. Our `staleness.ts` checks the correct non-dot filename
  (`graphify-out/needs_update`); the skill also cleans a dot-variant
  `.needs_update` (SKILL.md:635) — cheap hardening: check both.
- `graphify check-update <path>` (cron-safe): silent, exit 0 when nothing
  pending **[emp]**. Alternative staleness oracle; spawns Python (~0.5s), ours
  is a cheaper `find`.
- Notables from `--help`: `extract --code-only` (no API key, indexes code
  only), `cluster-only`, `global add` (cross-repo graph at
  `~/.graphify/global-graph.json`), `hook install` (git post-commit hooks —
  an alternative trigger ecosystem we deliberately don't use).

## 4. engram CLI (v3.3.2, Go binary) — verified behavior

**[emp]** in `/tmp/eng-test` + **[web]** DOCS.md:

- Local `engram sync`: **no server required**; reads `~/.engram/engram.db`
  (SQLite WAL, exists on this machine), exports compressed chunks to
  `<project>/.engram/chunks/`. Idempotent ("Nothing new to sync… already
  exported"), exit 0. Chunks are **Git-portable by design** — the local sync
  path is a *cross-machine sharing* mechanism, not a backup.
- `engram sync --cloud --project X`: syncs one project to configured cloud
  endpoint; requires explicit project (**[emp]** `engram sync --help`).
- Prints an upgrade notice to stdout (3.3.2→3.4.0) — lands in our log files,
  harmless.
- `gentle-engram` is the **official** Pi package (MCP stdio, 26 tools);
  pi-reconcile's `engram sync` spawning is complementary (export/replication),
  not overlapping (MCP = live reads/writes; sync = portability).

## 5. openspec conventions (v1.14.1, @fission-ai/openspec)

- **Archive naming**: `openspec archive` prepends `YYYY-MM-DD-` to the change
  name and never stacks a second prefix
  (**[pkg]** `/usr/lib/openspec/dist/core/archive.js:26-27`
  `ARCHIVE_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}-/`). Our `newArchives`
  detection reads these names — convention confirmed.
- Task files seen in the wild on this machine: ramona-plan `4-tasks.md`
  (this repo), spec-driven `tasks.md` (~/galactica, un-numbered, with
  `- [ ] **N.M …**` bold-wrapped items). Our filename regex
  `/(^|[-_])tasks?\.md$/i` matches both; our checkbox regex matches
  `- [x] **1.1 …**` (case-insensitive `[x]`, content follows) — **[emp]**.
- ramona-plan flow: idea → plan → execution → tasks, tasks checkbox lines
  must stay machine-countable (openspec instructions **[emp]**).
- Gate (`npm:@aemonge-dev/pi-openspec-gate`) is active in sessions on this
  machine — blocks "unaccounted mutations" until a change+focus exists
  (**[emp]** this session). pi-reconcile never depends on it (correct), but
  its state could be *read* for richer boundaries.

## 6. Environment facts

- GNU findutils 4.11 (**[emp]** `find --version`) — `-regextype
  posix-extended` OK here. macOS BSD find needs `-E` (no `-regextype`);
  Windows: no find(1). Current code degrades to `"unknown" → allow` there
  (fail-open, cooldown-protected) — workable, should be documented or fixed
  with a platform branch.
- No engram server on :7437; `~/.engram/engram.db` is the live local store.
- Only openspec trees on the machine: this repo (created today) and
  `~/galactica/.config/openspec` (no `archive/` dir yet — our
  `existsSync` guard handles that).
- graphify skill installed at `~/.pi/agent/skills/graphify/` (v0.9.85) — the
  LLM-side counterpart of the CLI we spawn.

## 7. Gaps confirmed in current v0.1.0 code (carry into plans)

1. **Cross-session blindness**: first snapshot at `session_start` has no
   previous-session baseline → archives/checkboxes crossed while pi was
   closed never diff. Fix: persist snapshot to `.pi-reconcile/state.json`.
2. **Cooldown state is in-memory only** (`executors.ts` `lastRun` Map) —
   lost on restart; persistence makes cooldowns meaningful across sessions.
3. `tool_result` handler ignores `policy.enabled` (index.ts).
4. Policy cached from session_start; mid-session edits invisible until
   `/reconcile`.
5. `session_shutdown` fires on reload/new/resume/fork — our "final" engram
   sync runs on session switches too (idempotent + cooldown → acceptable, but
   should be a policy choice).
6. mtime-staleness loop after touch-only changes (§3).
7. `needs_update` also exists as dot-variant (§3) — check both.
8. npm distribution needs `pi.extensions` manifest (§2).
9. No failure surfacing: detached spawns' fates live only in log files.
10. No tests beyond import/self-diff smoke.
