# Plan: Three researched implementation propositions delivered as markdown

> Estimate: ~1 hour (research ~35 min, writing ~25 min) — confidence high
> Evidence: installed CLIs (`graphify`, `engram` at /usr/bin), pi-coding-agent@1.3.0 types in node_modules, on-disk openspec projects, external docs
> Parent: research-three-plans
> Human wait: user is away ~1 hour; plans must stand alone without a live Q&A

## Done when

- `plans/2026-10-17-research-notes.md` exists and records verified facts with
  citations: Pi extension API surface (events, ctx shapes, loading), graphify
  `update`/`extract`/`check-update` behavior verified empirically in /tmp,
  engram `sync` modes verified, real openspec archive/tasks naming from local
  projects, staleness portability facts (GNU vs BSD find).
- Three plan files exist under `plans/` (A, B, C), each self-contained:
  goal, non-goals, architecture deltas, step-by-step work breakdown with
  target files, testing/acceptance criteria, risks, estimate, and open
  decisions. Each plan is a genuinely distinct strategy, not a reskin.
- `plans/README.md` compares the three (scope/risk/effort table) and states a
  recommendation.
- No non-markdown file is created or modified in this repo by this change.

## Scope

- Research: installed package internals, local environment survey, web docs,
  empirical CLI tests confined to /tmp.
- Writing: plans/*.md only.

## Exclusions

- Any source code changes to the extension.
- Publishing, tagging, or install-path changes.
- Choosing between the three plans — that is the user's decision on return.
