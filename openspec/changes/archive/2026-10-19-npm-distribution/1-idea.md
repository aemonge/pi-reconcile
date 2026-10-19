# Idea — npm distribution (Plan B Phase 3, pulled forward)

v0.2.0 is validated and tagged; the user wants `pi install`-able npm
distribution now rather than bundled with the engine phase.

- Research §2 verified: `pi install npm:<pkg>` requires a `pi` manifest
  (`"pi": { "extensions": ["./index.ts"] }`); `package.json` `"main"` is
  ignored. Raw TS ships directly (jiti loads it — no build step).
- Reference implementations (installed, working): the user's own
  `@aemonge-dev/pi-openspec-gate` (files: index.ts+src, pi.extensions
  ["./index.ts"]), `graphify-pi` (extensions dir), `gentle-engram`
  (index.ts + assets). Plus the official
  `pi-coding-agent/examples` dir.
- No code changes — packaging metadata only (package.json `pi` + `files`,
  README install section), then publish + scratch-install verification.

## Plan

1. package.json: add `pi.extensions` manifest + tight `files` list
   (five .ts sources, sync-policy.example.json, README, LICENSE).
2. README: replace "npm distribution not wired yet" with real
   `pi install npm:pi-reconcile` instructions; adjust future-proofing note.
3. `npm publish --dry-run` → review tarball contents (manifest included,
   nothing private).
4. `npm publish` (name `pi-reconcile` if free, else scoped).
5. Scratch verification: `pi install npm:pi-reconcile` in a clean project;
   confirm loader-scan placement + settings.json entry; load test.
6. Archive change, commit, re-point tag v0.2.0, push.

## Acceptance

- `npm view` shows the published package with the `pi` manifest.
- Scratch `pi install` results in a loadable extension (loader convention
  satisfied), settings.json records it.
- Repo README no longer claims distribution is unwired.
