# Plan — Phase 1 scope (from plans/plan-a-iron.md, verbatim scope)

Same architecture; fixes live in existing modules + one new test script +
one runtime state file (`.pi-reconcile/state.json`). Open decisions from
plan-a-iron.md resolved: `crossSession` **on by default** (policy flag to
disable); log retention **10 per key**.

1. **Persistent boundaries** (`index.ts`, `boundaries.ts`) — write
   `{snapshot, lastRun}` to `~/.pi/agent/pi-reconcile-state.json` (home file,
   per-project entries keyed by cwd, atomic tmp+rename, fail-open) at
   `session_shutdown`; at `session_start`, if `policy.crossSession`, diff
   persisted→fresh snapshot and run `applyBoundaries` on the delta before
   overwriting state. *(Location moved from `<cwd>/.pi-reconcile/state.json`
   to the pi agent home per human decision 2026-10-19 — repos stay free of
   runtime state; `~/.pi/agents/` was considered but is empty — the live
   convention is `~/.pi/agent/` alongside auth.json/settings.json.)*
2. **Persistent cooldowns** (`executors.ts`) — `lastRun` hydrated from
   state.json at session_start, written on every spawn.
3. **Staleness hardening** (`staleness.ts`) — also match `.needs_update`;
   darwin branch uses `find -E . -regex`; non-darwin/non-linux → `"unknown"`
   intentionally; touch-loop mitigation via `graphFreshUntil` window in
   state (graphify skips no-op rewrites, so mtime can't move inside it).
4. **Nits** (`index.ts`) — `tool_result` early-return when policy disabled;
   reload policy at `agent_end`; `session_shutdown` engram fallback gated on
   `event.reason === "quit"` OR cooldown, reason logged.
5. **Observability** (`executors.ts`, command) — per-key log retention (keep
   10, delete oldest on spawn); `/reconcile status` prints last 3 log names
   per action + last line of newest log (exit visibility).
6. **Tests** (`scripts/test-boundaries.mjs`, `npm test`) — tempdir fixtures,
   no framework: task flip → `tasksCompleted: 1`; new archive dir →
   `newArchives`; archive move ≠ task completion; uncheck+recheck → 0;
   pre-checked new change counts; policy merge semantics; `countChecked`
   galactica-style `- [x] **N.M …**` lines.
7. **Docs truth pass** (`README.md`) — verified contracts only (research
   §3–§5): timings 0.7–2.5 s, `needs_update` = semantic pass owed (update
   does not clear it), archive `YYYY-MM-DD-` prefix, GNU/BSD find note,
   `session_shutdown` reasons, `pi.extensions` npm requirement.

## Acceptance (from plan-a-iron.md)

- `npm run check` clean; `npm test` green; smoke green.
- `git diff` touches only: `index.ts`, `boundaries.ts`, `staleness.ts`,
  `executors.ts`, `policy.ts` (if the `crossSession` flag lands there),
  `scripts/test-boundaries.mjs` (new), `README.md`, `package.json` (test
  script only).
- Manual soak: flip task box → graphify once; archive → engram; restart
  with pending archive → cross-session sync at start.

## Decided semantics (from Step 1 review, 2026-10-19)

- **D1 (minor) — disabled policy ⇒ no state I/O at all:** when
  `policy.enabled=false` at session start/shutdown, state is neither read
  nor written (hydration + persistence skipped). Chosen semantics, not an
  accident: "disabled = zero side effects". Consequence: a disable→re-enable
  cycle may replay against an older baseline → delayed, idempotent syncs.
- **D2 (minor) — single-process-per-cwd assumption:** fixed tmp name
  `state.json.tmp` + module-global snapshot/lastRun; two pi processes in one
  project worst-case lose one logged write (file stays valid JSON). Matches
  v0.1's module-global cooldown design; to revisit in Phase 2's `state.ts`.
- **D7 (nit) — claim correction:** one double-cast (`as unknown as T`)
  remains in `policy.ts` merge(); only the load-time casts were removed.
- **State location (human decision, 2026-10-19):** one home file
  `~/.pi/agent/pi-reconcile-state.json`, `{version:1, projects: {<abs cwd>:
  {snapshot, lastRun, updatedAt}}}`. Saves re-read + merge (other projects'
  entries survive concurrent sessions), prune to 64 most-recent entries.
  Corrupt file → empty (self-healing). Residual: concurrent save from two
  processes can lose one project's update (same fail-open class as D2 —
  worst case one cooldown window lost).
- Cooldown hydration intentionally NOT gated by `crossSession` (reviewer
  agrees): un-hydrated cooldowns would let the session_end engram fallback
  re-fire after every restart — the opposite of what disabling replay wants.
- Checks re-run in parent session: `npm run check` exit 0, smoke all green
  (node_modules freshly installed; package-lock.json is new). Step 6
  verifier re-confirms before commit.

## Risks

- Shutdown write racing a fast reload → atomic write + shutdown handler is
  awaited (verified: runner.js:80-86).
- Policy reload at `agent_end` = one JSON read per run → negligible.
