# Idea: Research-grounded implementation plans for pi-reconcile

As the developer of pi-reconcile I need a researched, decision-ready set of
implementation options so that the next development session picks a plan and
starts building without re-deriving context.

Observed pain: v0.1.0 is contract-verified against the installed graphify and
engram CLIs, but known gaps remain undecided (cross-session boundary
blindness, `update` vs `extract` semantics, platform portability of the
staleness check, silent-failure observability), and no plan document exists
to pick between conservative hardening and larger evolutions.

Direction: run a bounded research pass (Pi extension API from the installed
package, local openspec/graphify/engram reality, external docs, empirical CLI
tests in /tmp), then write exactly three complete implementation plans as
markdown files under `plans/` plus research notes. Hard limits: this change
produces documentation only — no source code, no package.json edits; all
written artifacts are `.md`.
