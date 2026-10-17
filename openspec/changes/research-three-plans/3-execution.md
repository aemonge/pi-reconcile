# Execution: research pass, then three markdown plans

> Estimate: ~1 hour total — matches plan
> Human wait: away ~1 hour; no live questions, plans must stand alone
> Parents: research-three-plans (idea, plan)

## Skills

- Research synthesis (web + local evidence gathering with citations)
- Technical writing (markdown plan documents, self-contained)

## Workflow

> Parallel scouts for breadth, own hands for empirical CLI truth, synthesize
> only after evidence lands.

## Steps

1. Scout A: Pi extension API from node_modules/@earendil-works/pi-coding-agent (events, ctx, registerCommand, loading, durable).
2. Scout B: local environment (~/.pi/agent, real openspec projects, CLI facts).
3. Web: Pi extension/durable docs; engram sync/cloud docs; graphify + openspec conventions.
4. Empirical /tmp tests: graphify update on a scratch repo (outputs, timing, needs_update semantics); engram local sync output shape; GNU find flags.
5. Write plans/2026-10-17-research-notes.md (verified facts + citations).
6. Write plans/plan-a-*.md, plan-b-*.md, plan-c-*.md (three distinct strategies).
7. Write plans/README.md comparison + recommendation.
8. Fill 4-tasks.md as steps complete; final checkbox is Human validation.

## Verification

- Every fact in research notes carries a citation (path, command, or URL).
- Each plan file contains: goal, non-goals, architecture delta, work breakdown
  with file targets, acceptance, risks, estimate, open decisions.
- `git status --porcelain` shows only .md/.yaml files created under plans/ and
  openspec/ — no .ts/package.json touched.

## Safety and authority

- Empirical CLI runs confined to /tmp scratch dirs; the real engram store is
  never mutated (local sync is an export/read path); no writes outside the
  repo except /tmp and this change's openspec/ artifacts.
- Declared work: user message of 2026-10-17 ("Do a full research… present me
  back three plans… write only .md or .qmd files").

## History

- Declared against commit c37fa79 (v0.1.0).
