#!/usr/bin/env node
/**
 * Smoke test: exercise every module against a real project directory.
 *
 *   node scripts/smoke.mjs [project-dir]
 *
 * Default project dir: the directory containing this extension's parent
 * (i.e., run from the repo, defaults to the repo itself as a no-openspec
 * project — pass a project with openspec/ to exercise boundaries).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const extDir = resolve(here, "..");

const target = resolve(process.argv[2] ?? extDir);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// 1. every module imports cleanly (also parses index.ts without running it)
const boundaries = await import("../boundaries.ts");
const staleness = await import("../staleness.ts");
const policyMod = await import("../policy.ts");
const executors = await import("../executors.ts");
const index = await import("../index.ts");

check("boundaries.ts imports", typeof boundaries.snapshot === "function");
check("staleness.ts imports", typeof staleness.isGraphStale === "function");
check("policy.ts imports", typeof policyMod.defaultPolicy === "object");
check("executors.ts imports", typeof executors.runBackground === "function");
check("index.ts default export is an extension factory", typeof index.default === "function");

// 2. snapshot works on the target project (openspec optional)
try {
  const snap = await boundaries.snapshot(target);
  check(
    "boundary snapshot",
    snap.present === existsSync(resolve(target, "openspec", "changes")),
    snap.present
      ? `openspec present, checkedTasks=${snap.checkedTasks}, archived=${snap.archived.length}`
      : "no openspec/ (fallback mode)",
  );
  const d = boundaries.diff(snap, snap);
  check("self-diff is empty", d.tasksCompleted === 0 && d.newArchives.length === 0);
} catch (err) {
  check("boundary snapshot", false, String(err));
}

// 3. staleness check runs (result depends on the project's actual state)
try {
  const stale = await staleness.isGraphStale(target, policyMod.defaultPolicy.graphify.codeExtensions);
  check("staleness check runs", stale !== undefined, `stale=${String(stale)}`);
} catch (err) {
  check("staleness check runs", false, String(err));
}

// 4. policy loader tolerates missing file
const loaded = await policyMod.loadPolicy(target);
check("policy loader returns defaults", loaded.enabled === policyMod.defaultPolicy.enabled);

console.log(failures === 0 ? "\nsmoke: all green" : `\nsmoke: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
