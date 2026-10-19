# pi-reconcile

Reconcile **derived artifacts** — the graphify knowledge graph, the
[engram](https://github.com/Gentleman-Programming/engram) memory store —
whenever work crosses an **openspec boundary**. A standalone extension for
the [Pi coding agent](https://github.com/earendil-works/pi). Fail-open by
contract: syncs run in the background, log to files, and never block or
break a session.

```
task completed (checkbox flip)  →  graphify update   (if guard allows)
change archived (dir move)      →  engram sync       (cloud if project+mode, else local)
session quit (reason="quit")    →  engram sync       (idempotent fallback; switches don't)
session start, graph stale      →  graphify update
archives crossed while closed   →  engram sync       (cross-session replay)
no openspec in repo             →  dirty flag → graphify at agent_end
```

## Install

```bash
pi install npm:pi-reconcile
```

Verify with `pi list`; configure via `sync-policy.json` (below) — see the
Policy section. To develop from a checkout instead:

```bash
git clone https://github.com/aemonge/pi-reconcile
pi --extension ./pi-reconcile
```

The npm package ships raw TypeScript loaded via jiti (no build step), with
a `pi.extensions` manifest — the same distribution shape as
`@aemonge-dev/pi-openspec-gate` and `gentle-engram`.

Zero runtime npm dependencies. Verified against
`@earendil-works/pi-coding-agent@1.3.0` extension API (`session_start`,
`tool_result`, `agent_end`, `session_shutdown`, `registerCommand`).
`session_shutdown` fires with `reason: "quit" | "reload" | "new" |
"resume" | "fork"` — only `"quit"` is a real session end; the others are
runtime switches, and the `session_end` engram fallback honors that.
Requires Node ≥ 22.18 (type stripping for tests/smoke).

## Why it exists (and why it is NOT inside the openspec gate)

If you run a pi-openspec-gate, it is a **fail-closed guard**: it blocks
unaccounted mutations, and its trustworthiness depends on staying small.
This extension is **fail-open operations**: background reconciliation that
may fail harmlessly. Mixing the two would put spawn/process logic inside the
one component whose job is to be unimpeccable.

The gate's *model* (tasks, changes) is still the trigger system — but the
boundaries are read **from the openspec directory itself**, so there is
zero code dependency on any gate:

| openspec on-disk signal | Boundary | Fires |
| --- | --- | --- |
| checkbox flips in `changes/<slug>/*-tasks.md` | task completed | `graphify update .` — if the guard allows |
| new dated dir in `changes/archive/` (`YYYY-MM-DD-<change>`, prefix never stacked) | change archived | `engram sync` |
| archives appeared while pi was closed | change archived | `engram sync` (replay at `session_start`) |
| session start, graph stale | leftovers from last session | `graphify update .` |
| session quit | whatever escaped earlier boundaries | `engram sync` (fallback) |
| *(no openspec in repo)* | — | dirty flag → `graphify` at `agent_end` |

If a gate ever grows an event bus, subscribing becomes an *optimization*
(instant instead of diff-detected), never a dependency.

## State (cross-session memory)

Runtime state — last boundary snapshot, cooldown timestamps, the graph
fresh-window — lives in **one home file**:

```
~/.pi/agent/pi-reconcile-state.json
{ "version": 1, "projects": { "<abs project path>": { "snapshot": …, "lastRun": …, "graphFreshUntil": …, "updatedAt": … } } }
```

- **Cooldowns survive restarts** (`lastRun` hydrated at `session_start`).
- **Cross-session replay**: boundaries crossed while pi was closed (e.g. a
  change archived by the CLI) fire at the next `session_start`. Disable per
  project with `"crossSession": false` in `sync-policy.json` (default on;
  v1 policy files without the key keep working).
- The file is pruned to the 64 most recently updated projects; corrupt files
  are treated as absent (fail-open, self-healing). No *state* is written
  into your repos (sync logs still go to `<repo>/.pi-reconcile/logs/`, and
  local engram sync exports `<repo>/.engram/` chunks by design).

## Policy

Defaults live in `policy.ts`. Override per-project with `sync-policy.json`
in the repo root (see `sync-policy.example.json`). Top-level objects merge
key-by-key; arrays **replace** (never concatenate).

```json
{
  "crossSession": true,
  "graphify": { "enabled": true, "guard": "dirty_and_stale", "minIntervalMs": 300000 },
  "engram":   { "enabled": true, "mode": "cloud", "project": "my-project", "when": ["change_archive", "session_end"] }
}
```

- `crossSession` — replay boundaries crossed while pi was closed (default
  `true`).
- `toolClasses.code` — tools that set the dirty flag (`write`, `edit`,
  `bash`, …). Extend for MCP/custom tools that mutate code.
- `graphify.guard` — `dirty_and_stale` (default: task boundaries need the
  graph to be actually out of date; the no-openspec fallback additionally
  requires code tools to have run), `stale`, or `none`.
- `engram.project` — required for `--cloud`; falls back to `$ENGRAM_PROJECT`,
  then to a local `engram sync` export (chunk export to `<project>/.engram/`,
  no server needed — git-portable by design).

## Staleness (what "stale" means, verified against graphify v0.9.85)

`graphify update .` is AST-only (**0.7–2.5 s**, no LLM, no API key). Two
signals make staleness cheap and deterministic:

1. **`graphify-out/needs_update` or `.needs_update` exists** — graphify's
   watch layer writes `needs_update` for doc/paper/image changes (the
   dot-variant is the graphify skill's). It means an LLM
   **semantic re-extraction is owed** (`graphify extract` / the graphify
   skill); `update` does **not** clear it. pi-reconcile treats it as stale
   and lets the spawn happen; clearing the marker is the skill's job.
2. **A code file is newer than `graphify-out/graph.json`** (`find -newer`,
   first hit wins). GNU find on Linux (`-regextype posix-extended`), BSD
   find on macOS (`-E`); elsewhere the check returns `unknown` — boundaries
   fail open (unknown → allowed, cooldown-bounded), while the
   session-start trigger requires a definite stale and simply won't fire
   there.

Touch-loop mitigation: after any successful graphify spawn, staleness
short-circuits `false` for one `minIntervalMs` window (no-op updates leave
outputs untouched, so the mtime signal can't move inside it).

## Commands

- `/reconcile` — force graphify + engram sync now
- `/reconcile status` — policy state, dirty flag, openspec snapshot, last
  runs, plus the newest 3 log files per action with the last line of the
  newest log (exit/output visibility without opening files)

## Development

```bash
npm install          # dev-only: typescript + pi-coding-agent types
npm run check        # tsc --noEmit
npm test             # 27-check matrix: boundary fixtures, staleness, lifecycle harness
npm run smoke        # module import + snapshot smoke against a project dir
npm run smoke -- /path/to/some/project
```

The lifecycle harness (`scripts/test-boundaries.mjs`) drives the real
extension through a fake `ExtensionAPI` with PATH-stubbed `graphify`/
`engram` binaries and a `HOME`-isolated state file — flip → agent_end →
graphify fires once; archive while "closed" → replay fires engram at the
next `session_start`; reload shutdowns don't fire the fallback; cooldowns
and log retention are asserted end-to-end.

Design facts worth knowing before you change things:

- **Guard asymmetry**: sync failure logs to `.pi-reconcile/logs/` (10 most
  recent per action kept) and is reported via notify; it can never throw
  into the session.
- **Cooldowns** (`minIntervalMs`) prevent rebuild storms on busy sessions
  and persist across restarts; the boundary logic is idempotent anyway.
- **Staleness check needs no git**: marker + `find -newer`. Works in
  non-git repos.
- **Checkbox regex** (`/^[ \t]*[-*][ \t]+\[x\]/gim`) matches ramona-plan
  `4-tasks.md` and spec-driven `tasks.md` layouts, including bold-wrapped
  `- [x] **1.1 …**` items (case-insensitive); adjust `boundaries.ts` if
  your schema differs.
- **Tuning first**: `bash` dirties conservatively (every bash result) — add
  a read-only allowlist if it over-triggers; `agent_end` diffs run on every
  run end — debounce or move to shutdown-only if too hot.

## Future-proofing

The policy file is the asset; the extension is a sacrificial layer. The
`pi.extensions` manifest ships (v0.2.0+), so `pi install` is the
distribution path; if the Pi extension API grows durable hooks, the
boundaries/executors translate mechanically and this package re-shapes
without losing configuration. No such target exists in 1.3.0 — this is a
direction, not a promise.

## License

MIT
