# Execution — delegation & sequence

Ramona loop; each step bounded, verified before the next. Implementer does
the change, reviewer checks the risky seams, verifier confirms evidence.

| Step | What | Who | Check |
|---|---|---|---|
| 1 | Items 1+2: state.json write/read, cross-session delta, persistent cooldowns | implementer | atomic write, fail-open, acceptance 1 of plan-a-iron.md; reviewer on state seam |
| 2 | Item 3: staleness hardening (dotfile variant, darwin `-E`, `graphFreshUntil`) | implementer | reviewer on staleness seam |
| 3 | Items 4+5: nits + log retention + status tails | implementer | check output cited |
| 4 | Item 6: test matrix `scripts/test-boundaries.mjs` + `npm test` wiring | implementer | all cases from plan item 6 |
| 5 | Item 7: README truth pass | implementer | every claim maps to research § |
| 6 | Full verification: `npm run check`, `npm test`, soak per acceptance | verifier | evidence without mutation |

Seams the reviewer must hit: **state-file atomicity/race** (step 1) and the
**spawn/cooldown wrapper** (steps 1–2). Both feed Plan B Phase 2's
`state.ts`/`actions/` extraction unchanged.

Stop conditions: any acceptance red at step 6, or scope creep toward the
engine (policy v2, actions/) — that's Phase 2, halt and reassess.
