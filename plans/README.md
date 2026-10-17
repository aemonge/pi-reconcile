# pi-reconcile — three implementation propositions

Written 2026-10-17 after a full research pass (see
[`2026-10-17-research-notes.md`](./2026-10-17-research-notes.md) — every claim
there is verified against the installed Pi package, the real graphify/engram
CLIs, live openspec projects, and `/tmp` reproductions).

| | [Plan A — Iron](./plan-a-iron.md) | [Plan B — Engine](./plan-b-engine.md) | [Plan C — Orchestrator](./plan-c-orchestrator.md) |
|---|---|---|---|
| **Thesis** | Fix every verified defect; change nothing architectural | Policy-driven action engine + real npm distribution | Reconciler registry: the ops tier for *all* derived artifacts |
| **Scope** | 7 fixes, tests, docs | A + engine/actions/state v2 + `pi` manifest | B + registry, ecosystem coordination, quarto/global-graph, widget |
| **New capabilities** | cross-session sync, persistent cooldowns, log tails | typed actions, exit codes, history, `session_shutdown` reasons, completions, `needs_update` surfacing, `pi install` | dedup with neighbors (gentle-engram, graphify skill, gate), qmd render, global graph, dashboard |
| **Files touched** | ~5 existing + 1 new | A + 4 new modules | B + 6 new modules |
| **Effort** | 1–2 sessions (4–6 h) | ~1 week | ~3 weeks (phased, stop-anytime) |
| **Risk** | Low | Medium | Medium-high (front-loads design) |
| **Ships as** | v0.2.0 | v0.3.0 | v1.0.0 |
| **Depends on research facts** | §3–§7 | §1–§4, §7 | all |

## Key research findings that shaped all three

1. The extension API has **41 events** (we use 4) — including
   `turn_end`, `mcp_servers_change`, `resources_discover`, `ui.setWidget` —
   and `session_shutdown` fires on session switches, not just quit.
2. **`pi install` ignores `package.json` "main"** — npm distribution needs a
   `pi.extensions` manifest. Current package.json wouldn't load as a package.
3. graphify `update` is AST-only (0.7–2.5 s, no LLM) and **cannot clear**
   `needs_update` — that marker means an LLM semantic pass is owed. Honesty
   about this gap is a feature in B/C.
4. engram local `sync` is a Git-portable chunk export needing no server;
   cloud sync needs `--project`. Both verified live.
5. openspec archives are `YYYY-MM-DD-<change>` dirs — boundary detection is
   keyed correctly, but is blind across sessions without state persistence.
6. `pi-durable` does not exist in 1.3.0 — the README's migration-path
   section should be rewritten as future-proofing, not a real target.

## Recommendation

**Take Plan B.** Reasons:

- Its Phase 1 *is* Plan A — the verified defects get fixed either way; the
  real choice is whether to stop there.
- Plan B fixes the things that make v0.1 unsupportable in the field:
  invisible failures (exit codes + history), surprise `session_shutdown`
  semantics, dead-end npm distribution, and the AST-vs-semantic honesty gap.
- It is built so **Plan C remains reachable without rework**: the closed
  action set is the seam where the registry plugs in later. If artifact
  count grows (quarto, global graph), phase into C from B.
- Choose A only if you want a stabilizing release before touching anything
  new; choose C only if you're committing to the multi-week arc now.

## Suggested next step (any plan)

`openspec new change <slug> --schema ramona-plan` per plan (or continue in
this repo's `research-three-plans` change), Phase/Step 1 to the implementer,
reviewer on the state-file and spawn-wrapper seams (the two riskiest pieces).
