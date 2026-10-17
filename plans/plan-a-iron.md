# Plan A — "Iron v0.2": correctness, portability, and trust

> Strategy: **change nothing architectural.** Fix every verified defect from
> the research notes, add the missing tests, and make failures visible.
> The result is a small extension you forget exists because it never
> surprises you.
> Basis: `plans/2026-10-17-research-notes.md` §1–§7.

## Goal

pi-reconcile v0.2.0: same architecture, same two reconcilers, zero known
defects, test-covered boundary logic, and observable background runs.

## Non-goals

- New reconcilers or policy schema changes (Plan B).
- Any plugin/registry refactor (Plan C).
- Windows support beyond documented degradation.

## Architecture delta

None. All changes are inside existing modules plus one new file
(`scripts/test-boundaries.mjs`) and one state file at runtime
(`​.pi-reconcile/state.json`).

```
index.ts        + persist snapshot at shutdown; reload policy at agent_end
boundaries.ts   unchanged logic (+fixtures prove it)
staleness.ts    + .needs_update variant; + darwin -E branch
executors.ts    + persistent cooldowns (state.json), + log retention
policy.ts       unchanged schema
scripts/        + test-boundaries.mjs (tempdir fixture tests)
```

## Work breakdown

1. **Persistent boundaries** (`index.ts`, `boundaries.ts`)
   - At `session_shutdown`: write `{snapshot: state.snap, lastRun: {...}}`
     to `<cwd>/.pi-reconcile/state.json` (best-effort, fail-open).
   - At `session_start`: if state.json exists and policy
     `crossSession: true` (new default), diff persisted snapshot → fresh
     snapshot and run `applyBoundaries` on the delta *before* overwriting
     state. Archives crossed while pi was closed now fire engram sync.
   - Acceptance: manual test — archive a change with pi closed, start pi,
     observe engram sync notification in `/reconcile status` history.
2. **Persistent cooldowns** (`executors.ts`)
   - `lastRun` map hydrated from state.json on session_start, written on
     every spawn. Cooldowns survive restarts.
3. **Staleness hardening** (`staleness.ts`)
   - Check both `needs_update` and `.needs_update` (research §3).
   - Platform branch: `process.platform === "darwin"` → `find -E . -regex …`
     (same semantics, BSD syntax). Windows/other → return `"unknown"`
     explicitly (current behavior, now intentional + documented).
   - Touch-loop mitigation: after a boundary-triggered graphify spawn, store
     `graphFreshUntil = now + minIntervalMs` in state; `isGraphStale`
     short-circuits `false` inside that window (mtime can't move — graphify
     skips no-op rewrites).
4. **Small correctness nits** (`index.ts`)
   - `tool_result` handler: early-return when `!state.policy.enabled`.
   - Reload policy at `agent_end` (one JSON read per run end; cheap, makes
     mid-session `sync-policy.json` edits live within one run).
   - `session_shutdown`: only fire the engram session_end fallback when
     `event.reason === "quit"` OR cooldown allows; log the reason.
5. **Observability** (`executors.ts`, `index.ts` command)
   - Log retention: on spawn, delete oldest logs per key beyond 10.
   - `/reconcile status` additionally prints: last 3 log file names per
     action + last line of the newest log each (exit visibility without
     waiting on detached processes).
6. **Test matrix** (`scripts/test-boundaries.mjs`, run by `npm test`)
   - Tempdir fixtures, no framework: build fake `openspec/changes/`; assert —
     checkbox flip → `tasksCompleted: 1`; new archive dir → `newArchives`;
     archive move does **not** count as task completion; uncheck+recheck → 0;
     new change dir with pre-checked boxes → counts (documented semantics);
     policy merge: array override replaces, object merge merges;
     `countChecked` matches galactica-style `- [x] **N.M …**` lines.
7. **Docs truth pass** (`README.md`)
   - Replace assumed contracts with verified ones (research §3–§5): update
     timings (0.7–2.5s), needs_update semantics (semantic pass pending,
     update does not clear it), archive `YYYY-MM-DD-` prefix, GNU/BSD find
     note, `session_shutdown` reasons, npm `pi.extensions` requirement.

## Testing & acceptance

- `npm run check` clean; `npm test` green (new matrix); smoke still green.
- Manual soak: one session in an openspec project — flip a task box →
  graphify fires once; archive via CLI → engram fires; restart pi with a
  pending archive → cross-session sync fires at start.
- `git diff` touches only the files listed above.

## Risks

- state.json writes at shutdown could race a fast `reload` — mitigate:
  atomic write (tmp+rename), and shutdown handler is awaited (runner.js:80-86).
- Policy reload per agent_end adds one file read per run — negligible.

## Estimate

1–2 focused sessions (≈4–6 h). Confidence high — every fix is mechanical
against verified behavior.

## Open decisions

- Keep `crossSession` always-on or policy-gated? (Recommend: on by default,
  flag to disable.)
- Log retention count (10 per key) — fine?
