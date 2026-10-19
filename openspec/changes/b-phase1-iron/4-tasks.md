# Tasks

Legend: [ ] pending · [-] in progress · [x] done

## Task 1 — Foundation (steps 1–3 of plan)

- [x] Step 1 — persistent state + cross-session boundaries + cooldowns
  - done: 2026-10-19 · impl: implementer payload (gate-blocked in subagent) applied from parent session · `npm run check` exit 0 · smoke all green · reviewer GO (no blockers/majors; D1/D2 recorded in 2-plan.md)
  - delta: state relocated to `~/.pi/agent/pi-reconcile-state.json` (per-project map) per human request 2026-10-19 · check/smoke green · round-trip verified in /tmp · delta re-review GO (D1 fixed: pid-unique tmp names; D3 fixed: refuse overwrite of version>1; D2 accepted fail-open; D5 deferred to Step 4 test matrix — state I/O coverage)
  - delegation research: named sessions DO carry PI_SUBAGENT_DELEGATION (delegation entry verified in child session file); gate inheritance broken by pi-openspec-gate findSessionFile expecting `<sessionId>.jsonl` while pi writes `<timestamp>_<sessionId>.jsonl` (verified against real files) — fix belongs in @aemonge-dev/pi-openspec-gate
- [x] Step 2 — staleness hardening
  - done: 2026-10-19 · `.needs_update` + darwin `find -E` + explicit unknown + graphFreshUntil window (persisted, single choke point in graphify()) · check exit 0 · smoke green · reviewer GO (no blockers/majors; shadow-nit fixed; linux args verified byte-identical via git diff)
  - check: `.needs_update` matched; darwin `find -E`; `graphFreshUntil` window; reviewer pass

## Task 2 — Polish (steps 3–5 of plan)

- [x] Step 3 — nits + observability
  - done: 2026-10-19 · tool_result early-return · agent_end policy reload · session_shutdown reason log + strict quit-gate (enum verified) · log retention 10/key · /reconcile status log tails · check exit 0 · smoke green · reviewer GO · bonus: fixed pre-existing fd leak (closeSync after spawn, reviewer defect #1)
  - check: tool_result early-return; agent_end policy reload; shutdown reason gate; log retention 10; status shows log tails
- [x] Step 4 — test matrix
  - done: 2026-10-19 · parent-executed (human decision) · scripts/test-boundaries.mjs: 7 boundary/policy cases + 3 staleness units + fake-ExtensionAPI lifecycle harness (PATH-stubbed spawns, HOME-isolated state) · npm test wired · 27/27 green · tsc 0 · smoke green · reviewer audit GO (D1/D2/D3/D4/D6 strengthening applied: engram-attributed cooldown, T4a middle-snapshot, 2000-epoch seeds + L8c spawned-survives, exact local-sync args + ENGRAM_PROJECT scrub, T6d array guard)
  - check: `npm test` runs all seven fixture cases from plan item 6
- [x] Step 5 — README truth pass
  - done: 2026-10-19 · rewritten against research §2–§6 + live code · pi.install/npm honesty, quit-only fallback, state section (home file, crossSession), staleness semantics (needs_update = semantic pass owed, update doesn't clear; GNU/BSD/unknown; fresh-window), 27-check dev section, pi-durable section replaced with direction-not-promise · reviewer audit GO (0 blockers/majors; D1-D3+D5-D7 fixes applied; D4 Node-22.18 traceability accepted — derivable from bare .ts imports in scripts/)
  - check: all §3–§5 facts updated, no assumed contracts left

## Task 3 — Close out

- [x] Step 6 — verifier run (check, tests, soak evidence)
  - done: 2026-10-19 · fresh suite: check exit 0 · test 27/27 · smoke green · footprint exactly the declared files (boundaries.ts untouched vs HEAD) · no state-file leak into real HOME · verifier verdict PASS (all five audit tasks, no contradictions)
- [x] Step 7 — commit + human validation
  - done: 2026-10-19 · human authorized commit ("Commit, then guide me to validation"); decisions per recommendation: v0.2.0 bump, package-lock.json committed, .engram/+graphify-out/ gitignored · live-soak validation guide delivered post-commit

  gate-attributed · tool: bash · paths: — · at 2026-10-19T07:58:13Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T07:58:48Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/policy.ts · at 2026-10-19T08:19:17Z

  gate-attributed · tool: write · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T08:19:57Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/index.ts · at 2026-10-19T08:20:22Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T08:20:35Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/policy.ts · at 2026-10-19T08:21:46Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T08:21:55Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T08:22:47Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T08:49:22Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T08:49:27Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/index.ts · at 2026-10-19T08:49:34Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T08:49:44Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T08:50:14Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T08:51:27Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T09:01:44Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T09:02:41Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T09:02:47Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T09:13:34Z

  gate-attributed · tool: write · paths: /home/aemonge/projects/pi-reconcile/staleness.ts · at 2026-10-19T09:22:37Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T09:22:56Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/index.ts · at 2026-10-19T09:23:06Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T09:23:11Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T09:23:39Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T09:31:45Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T10:30:05Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T10:36:49Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/index.ts · at 2026-10-19T10:37:01Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T10:37:05Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T10:37:27Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/executors.ts · at 2026-10-19T10:42:38Z

  gate-attributed · tool: write · paths: /home/aemonge/projects/pi-reconcile/scripts/test-boundaries.mjs · at 2026-10-19T11:00:17Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/scripts/test-boundaries.mjs · at 2026-10-19T11:00:41Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/package.json · at 2026-10-19T11:00:48Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T11:01:00Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T11:01:24Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/scripts/test-boundaries.mjs · at 2026-10-19T11:10:18Z

  gate-attributed · tool: bash · paths: — · at 2026-10-19T11:10:22Z

  gate-attributed · tool: write · paths: /home/aemonge/projects/pi-reconcile/README.md · at 2026-10-19T11:22:14Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T11:22:28Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/README.md · at 2026-10-19T11:28:35Z

  gate-attributed · tool: subagent · paths: — · at 2026-10-19T11:58:58Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/package.json · at 2026-10-19T12:07:16Z

  gate-attributed · tool: edit · paths: /home/aemonge/projects/pi-reconcile/.gitignore · at 2026-10-19T12:07:21Z
