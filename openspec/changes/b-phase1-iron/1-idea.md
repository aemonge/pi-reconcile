# Idea — Plan B, Phase 1: "Iron" foundation

Decision made 2026-10-19: implement **Plan B** (`plans/plan-b-engine.md`,
recommended in `plans/README.md`). Plan B's Phase 1 is **all of Plan A**
(`plans/plan-a-iron.md`) — this change is that Phase.

- v0.1.0 works but has 10 verified defects/gaps (research notes
  `plans/2026-10-17-research-notes.md` §1–§7): no cross-session state,
  cooldowns lost on restart, `.needs_update` variant missed, BSD `find`
  broken on darwin, touch-loop retriggering, invisible failures.
- Every later Plan B deliverable (typed actions, engine, npm distribution)
  builds on `state.ts`-style persistence and the spawn wrapper — the two
  seams this Phase hardens.
- Out of scope here: action engine, policy v2, `pi.extensions` manifest
  (Phases 2–3 of Plan B; separate changes).
