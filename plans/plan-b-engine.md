# Plan B — "Reconciliation Engine v0.3": policy-driven actions, real distribution

> Strategy: **keep the boundary model, upgrade the execution model.**
> Boundaries stay disk-derived openspec signals (that contract is proven);
> what fires at a boundary becomes a small, typed **action engine** driven by
> policy v2 — with persistent state, exit visibility, and npm-first
> distribution. Plan A's fixes are Phase 1 of this plan (not skipped).
> Basis: `plans/2026-10-17-research-notes.md` §1–§7.

## Goal

pi-reconcile v0.3: a configurable reconciliation engine where each boundary
maps to a list of typed actions with independent guards, cooldowns, and
outcome records — shipped as a proper `pi install`-able npm package.

## Non-goals

- Third-party plugin registry / multi-reconciler ecosystem (Plan C).
- GUI/widget work beyond a status line.
- Rewriting boundary detection (already correct + tested in Phase 1).

## Architecture delta

```
index.ts          thin: events → engine.boundary(...)
engine.ts (new)   boundary → action resolution + guards + dispatch
actions/ (new)    graphify-update, graphify-extract, engram-local,
                  engram-cloud, notify-pending-semantic
state.ts (new)    single .pi-reconcile/state.json store:
                  { snapshot, lastRun, history[], graphFreshUntil }
policy.ts         schema v2 (see below) + v1→v2 migration (mechanical)
executors.ts      spawn wrapper: sh -c '<cmd> ; echo "__EXIT__ $?" >> log'
                  → detached still, but exit code lands in the log tail
```

### Policy schema v2 (superset of v1; v1 files keep working)

```jsonc
{
  "boundaries": {
    "task_complete":      ["graphify-update"],
    "change_archive":     ["engram-cloud", "notify-pending-semantic"],
    "session_end":        ["engram-local"],
    "session_start_stale":["graphify-update"],
    "agent_end_dirty":    ["graphify-update"]
  },
  "actions": {
    "graphify-update":  { "type": "graphify", "mode": "update",   "guard": "dirty_and_stale", "cooldownMs": 300000 },
    "graphify-extract": { "type": "graphify", "mode": "extract",  "guard": "manual-only" },
    "engram-local":     { "type": "engram",   "mode": "local",    "cooldownMs": 60000 },
    "engram-cloud":     { "type": "engram",   "mode": "cloud",    "project": "my-project", "cooldownMs": 60000 },
    "notify-pending-semantic": { "type": "notify" }
  }
}
```

- Old `graphify:`/`engram:` blocks auto-migrate to boundaries+actions.
- `mode: "extract"` maps to `graphify extract --code-only` by default
  (no API key needed, research §3) — the LLM-backed semantic pass stays a
  manual/`manual-only` action because it costs money and keys.
- `manual-only` actions never auto-fire; they exist for `/reconcile run <id>`.

### New capabilities unlocked by verified API facts (research §1)

- **Exit visibility**: spawn wrapper appends `__EXIT__ <code>` to the log;
  `/reconcile status` parses last run's exit per action. No waiting on
  detached children, no session impact — fail-open preserved.
- **History**: engine records `{action, boundary, at, logFile, exit?}` ring
  buffer (last 50) in state.json → `/reconcile status` shows a real table.
- **`needs_update` surfacing**: when staleness detects the marker, the
  `notify-pending-semantic` action tells the user *"semantic extraction
  pending — run /graphify --update in your assistant"* (graphify update
  cannot clear it — research §3). This closes the AST-vs-LLM freshness gap
  honestly instead of silently.
- **`session_shutdown` reasons**: engine treats `quit` as session_end
  boundary; `reload/new/resume/fork` only fire actions whose policy says
  `onSwitch: true` (default false). Research §1 showed these fire on
  switches — now a choice, not a surprise.
- **Optional `turn_end` boundary**: for long runs, policy may add
  `turn_end_dirty` with its own (longer) cooldown — research §1 confirms the
  event and its awaited, ordered delivery.
- **`getArgumentCompletions`** on `/reconcile` (research §1): tab-completes
  `status | run <action-id> | logs [n] | policy`.

### Distribution (research §2)

- `package.json`: add `"pi": { "extensions": ["index.ts"] }`; keep `"main"`
  for editors. Publish scoped (e.g. `@aemonge-dev/pi-reconcile`).
- `pi install npm:@aemonge-dev/pi-reconcile` then works — verified loading
  rule (package.json `pi.extensions` manifest; `main` is ignored by pi).
- Dev path unchanged (`pi --extension ./pi-reconcile`).
- README gains a verified install section + the gate-relationship table.

## Work breakdown

1. Phase 1 = **all of Plan A** (state.json, staleness fixes, nits, tests,
   docs). Everything below builds on it.
2. `state.ts` — typed store, atomic writes, ring-buffer history.
3. `actions/` — one module per action type; shared
   `run(action, ctx): Promise<Outcome>` with guard + cooldown +
   spawn-wrapper; unit-testable with injected spawner.
4. `engine.ts` — boundary→actions resolution (schema v2 + v1 migration),
   dispatch, history recording, `graphFreshUntil` handling.
5. `index.ts` rewrite — events call `engine.boundary(name, ctx)`; command
   family with completions; policy reload at agent_end (from Plan A).
6. Tests — engine resolution table tests (v1 migration, guard matrix,
   cooldown persistence, exit-line parsing) + Plan A fixtures kept green.
7. Distribution — `pi` manifest, npm publish (dry-run first), install test
   in a scratch pi session, README install section.
8. Soak — one real openspec change driven end-to-end (task flips → archive)
   with `/reconcile status` history screenshots in the README.

## Testing & acceptance

- All Plan A tests green; new engine tests green.
- `/reconcile status` shows per-action last exit codes without reading logs
  by hand.
- v1 `sync-policy.json` (the example file) loads unchanged and migrates.
- `pi install` of the published package loads in a clean project (manual,
  final gate).

## Risks

- Schema migration bugs → mitigated by table tests + v1 example kept as
  fixture.
- `sh -c` wrapper differs on Windows → gate wrapper behind platform check,
  plain spawn elsewhere (documented).
- Scope creep toward Plan C — the registry line is deliberately *not*
  crossed: actions are a closed set, configured not plugged in.

## Estimate

~1 week of focused sessions (Phase 1: 1–2 days; engine+tests: 2–3 days;
distribution+soak: 1–2 days). Confidence medium-high.

## Open decisions

- Action set for v1 of the engine: the five above, or add
  `graphify-cluster-only`?
- Default boundary map exactly as the v1 defaults (no behavior change) or
  take the chance to move `session_end` → `engram-local` (cheaper, idempotent)
  and keep `engram-cloud` for archives only?
