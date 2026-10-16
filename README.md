# pi-reconcile

Reconcile **derived artifacts** — the graphify knowledge graph, the
[engram](https://github.com/Gentleman-Programming/engram) memory store —
whenever work crosses an **openspec boundary**. A standalone extension for
the [Pi coding agent](https://github.com/earendil-works/pi). Fail-open by
contract: syncs run in the background, log to files, and never block or
break a session.

```
task completed (checkbox flip)  →  graphify update   (if dirty & stale)
change archived (dir move)      →  engram sync --cloud
session end                     →  engram sync       (idempotent fallback)
session start, graph stale      →  graphify update
no openspec in repo             →  dirty flag → graphify at agent_end
```

## Install

```bash
# from this repo (adjust the source to your fork):
pi install <your-github-user>/pi-reconcile

# or develop directly from a checkout:
git clone https://github.com/<your-github-user>/pi-reconcile
pi --extension ./pi-reconcile
```

Zero runtime npm dependencies. Verified against
`@earendil-works/pi-coding-agent@1.3.0` extension API (`session_start`,
`tool_result`, `agent_end`, `session_shutdown`, `registerCommand`).
Requires Node ≥ 22.18 for the smoke script (type stripping).

## Why it exists (and why it is NOT inside the openspec gate)

If you run a pi-openspec-gate, it is a **fail-closed guard**: it blocks
unaccounted mutations, and its trustworthiness depends on staying small.
This extension is **fail-open operations**: background reconciliation that
may fail harmlessly. Mixing the two would put spawn/process logic inside the
one component whose job is to be unimpeccable.

The gate's *model* (tasks, changes, slices) is still the trigger system —
but the boundaries are read **from the openspec directory itself**, so there
is zero code dependency on any gate:

| openspec on-disk signal | Boundary | Fires |
| --- | --- | --- |
| checkbox flips in `changes/<slug>/*-tasks.md` | task completed (minor) | `graphify update .` — if dirty & stale |
| new dated dir in `changes/archive/` | change archived (major slice) | `engram sync --cloud` |
| session end | whatever escaped the gate | `engram sync` (idempotent fallback) |
| session start, graph stale | leftovers from last session | `graphify update .` |
| *(no openspec in repo)* | — | dirty flag → `graphify` at `agent_end` |

If a gate ever grows an event bus, subscribing becomes an *optimization*
(instant instead of diff-detected), never a dependency.

## Policy

Defaults live in `policy.ts`. Override per-project with `sync-policy.json`
in the repo root (see `sync-policy.example.json`):

```json
{
  "graphify": { "enabled": true, "guard": "dirty_and_stale", "minIntervalMs": 300000 },
  "engram":   { "enabled": true, "mode": "cloud", "project": "my-project", "when": ["change_archive", "session_end"] }
}
```

- `toolClasses.code` — tools that set the dirty flag (`write`, `edit`,
  `bash`, …). Extend for MCP/custom tools that mutate code.
- `graphify.guard` — `dirty_and_stale` (default: skip rebuild when a
  completed task never touched code), `stale`, or `none`.
- `engram.project` — required for `--cloud`; falls back to `$ENGRAM_PROJECT`,
  then to a local `engram sync` export.

## Commands

- `/reconcile` — force graphify + engram sync now
- `/reconcile status` — policy state, dirty flag, openspec snapshot, last runs

## Development

```bash
npm install          # dev-only: typescript + pi-coding-agent types
npm run check        # tsc --noEmit
npm run smoke        # module import + boundary/staleness smoke against a project dir
npm run smoke -- /path/to/some/project
```

Design facts worth knowing before you change things:

- **Guard asymmetry**: sync failure logs to `.pi-reconcile/logs/` and is
  reported via notify; it can never throw into the session.
- **Cooldowns** (`minIntervalMs`) prevent rebuild storms on busy sessions;
  the boundary logic is idempotent anyway.
- **Staleness check needs no git**: `needs_update` marker + `find -newer
  graph.json`. Works in non-git repos.
- **Checkbox regex** (`/^\s*[-*]\s+\[x\]/gim`) matches the ramona-plan task
  format; adjust `boundaries.ts` if your schema differs.
- **Tuning first**: `bash` dirties conservatively (every bash result) — add
  a read-only allowlist if it over-triggers; `agent_end` diffs run on every
  run end — debounce or move to shutdown-only if too hot.

## pi-durable migration path

This extension is the **sacrificial layer**; `sync-policy.json` is the
asset. When pi-durable (the experimental durable harness in the Pi monorepo)
stabilizes: the policy translates mechanically into durable hooks
(`beforeTool` for classification, durable tasks for boundaries),
`executors.ts`/`boundaries.ts` port as task bodies, and this extension is
deleted without guilt.

## License

MIT
