# Plan C — "Boundary Orchestrator": the ops tier of the openspec stack

> Strategy: **stop thinking "two CLIs at boundaries"; start thinking "one
> orchestrator for every derived artifact the work stack produces."**
> The gate guards *accountability*, the skills do *LLM work*, engram holds
> *memory*, graphify holds *code structure* — nothing reconciles the derived
> artifacts between them. pi-reconcile becomes that tier: a declarative
> artifact registry where reconcilers are detected, coordinated, deduplicated,
> and (eventually) cross-project. Plan B's engine is its Phase 2.
> Basis: `plans/2026-10-17-research-notes.md` §1–§6.

## Goal

pi-reconcile v1.0: a pluggable **reconciler registry** with ecosystem
coordination (detects gentle-engram/graphify-skill/gate and adapts), richer
boundaries, cross-project artifacts, and a live status surface — the single
place a user looks to know "are my derived artifacts current?"

## Non-goals (deliberate limits)

- No LLM work in-process (that's skills' job; we only *trigger and surface*).
- No fail-closed behavior, ever. The orchestrator degrades to notification.
- No coupling to gate internals beyond reading public on-disk state.

## Architecture delta

```
registry.ts (new)   reconciler interface:
                      detect(ctx): Presence      // is it installed/active?
                      staleness(ctx): Fresh|Stale|Unknown
                      reconcile(ctx, mode): Outcome
                      describe(): ArtifactCard    // for status/widget
reconcilers/ (new)   graphify.ts, engram.ts, openspec-sync.ts,
                     quarto.ts (.qmd render!), global-graph.ts
coordination.ts (new) ecosystem awareness:
                      - resources_discover + mcp_servers_change events
                        (research §1) → know when gentle-engram's MCP or the
                        graphify skill is present
                      - if gentle-engram active → default engram actions to
                        "cloud-replicate only" (MCP already covers live use)
                      - read gate state dir (public files) for extra
                        boundary signals: change focus moves, blocked-work
                        clears — as *advisory* boundaries, never blocking
ui.ts (new)          /reconcile dashboard via ui.setWidget + ui.custom
                      (research §1): one-line status "graph ✓ 2m · memory ✓
                      14m · qmd ✓ · 1 pending semantic" ; expandable card
boundaries.ts (ext)  advisory boundaries beyond openspec: gate focus change,
                      qmd source change, skill install/uninstall
```

### Reconciler interface (the core bet)

Every derived artifact implements the same four methods; the engine from
Plan B dispatches against the registry instead of a closed action set.
Policy v3 selects *which registered reconcilers* are active per project —
adding Quarto or a future tool is config + one module, not engine surgery.

### Ecosystem coordination (from verified environment facts, research §2, §5)

- This machine already runs: gate (`npm:@aemonge-dev/pi-openspec-gate`),
  gentle-engram (official Engram MCP), graphify skill + CLI. These are the
  neighbors; the orchestrator *senses* them:
  - `mcp_servers_change` → engram live-stack presence;
  - skill dirs (`~/.pi/agent/skills/graphify`) + `resources_discover`;
  - gate state files under `~/.pi/agent/` (public, read-only).
- **Deduplication rule**: if a neighbor already owns an artifact's freshness
  (e.g. graphify git hooks installed — `graphify hook status`), the
  orchestrator downgrades to *observe and report* instead of double-running.
- **Semantic bridge**: needs_update marker → orchestrator notifies through
  the *skill* path ("run /graphify --update") rather than spawning an LLM
  call itself — respects the cost boundary (research §3).

### New artifact classes worth registering day one

1. **Quarto artifacts** — sources `*.qmd` newer than rendered `*.html|*_files/`
   → boundary `agent_end_dirty` action `quarto render` (user hinted at qmd).
   Same staleness shape as graphify (mtime), zero new concepts.
2. **Global knowledge graph** — `graphify global add graphify-out/graph.json
   --as <project>` after each archive (research §3): cross-repo graph at
   `~/.graphify/global-graph.json` stays current without manual runs.
3. **openspec sync** — `openspec sync` workflow exists in the CLI's workflow
   list (research §5); archives are the natural trigger.

### Status surface (research §1)

- `ui.setWidget` persistent one-liner + `/reconcile` expanding card with
  per-artifact freshness, last exits (from Plan B state), pending-semantic
  flag, and cooldown countdowns. The orchestrator's promise is *visibility
  first*: you always know what's stale and why nothing ran.

## Work breakdown (phased; each phase shippable)

1. **Phase 0 — design doc** (`docs/registry-design.md`): interface, policy
   v3, coordination rules, degradation matrix. Review before code.
2. **Phase 1 — Plan A** (correctness base, unchanged).
3. **Phase 2 — Plan B** (action engine + state + exit visibility).
4. **Phase 3 — registry extraction**: move graphify/engram actions behind
   the reconciler interface; engine becomes registry-driven; policy v3.
5. **Phase 4 — coordination**: event listeners, presence detection,
   deduplication rules, gate advisory boundaries.
6. **Phase 5 — new reconcilers**: quarto, global-graph, openspec-sync.
7. **Phase 6 — status surface**: widget + dashboard command.
8. **Phase 7 — multi-project**: iterate workspaces (`~/.pi/agent/workspaces`
   exists, research §6), per-project state files, aggregate dashboard.

## Testing & acceptance

- Per-phase: Plan A/B suites stay green; registry gets contract tests with
  two fake reconcilers (fresh/stale/unknown × enabled/absent).
- Coordination tests: simulate `mcp_servers_change`, assert dedup decisions.
- Soak across two real projects (this repo + a qmd-bearing project) for a
  week; dashboard never lies (stale ⇒ actionable reason shown).

## Risks (highest of the three plans)

- **Speculative surface**: registry pays off only if artifact count grows.
  Mitigation: phases 3–5 are independently valuable (quarto + global graph
  alone justify them); stop after any phase and the product is still whole.
- **Ecosystem churn**: gentle-engram/graphify evolve (3.4.0 already pending,
  research §4). Mitigation: reconcilers pin verified CLI contracts in tests
  (spawn `--help`, assert flags) so upgrades that break us fail loudly in CI,
  not silently in sessions.
- **Widget API stability**: `ui.setWidget` is less battle-tested than
  `notify`. Mitigation: feature-flagged; fallback is notify-only.

## Estimate

Phases 0–2 ≈ Plan B (~1 week). Phase 3: 2–3 days. Phase 4: 2 days.
Phase 5: 2–3 days. Phase 6: 1–2 days. Phase 7: 2 days. Total ≈ 3 weeks of
focused sessions. Confidence medium (design risk front-loaded, hence Phase 0).

## Open decisions

- Registry interface: four methods as above, or split `reconcile` into
  `plan()/commit()` for dry-run support?
- Should gate advisory boundaries be policy-default-off until the gate
  publishes a stable state schema?
- Multi-project: v1 scope = dashboard only, or also cross-project engram
  cloud fan-out?
