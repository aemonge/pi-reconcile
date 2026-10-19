#!/usr/bin/env node
/**
 * Boundary + lifecycle test matrix — no framework, tempdir fixtures.
 *
 *   node scripts/test-boundaries.mjs   (or: npm test)
 *
 * Two layers:
 *   1. Boundary units — snapshot/diff semantics from plans/plan-a-iron.md
 *      item 6 (flip counts, archive move ≠ completion, uncheck+recheck,
 *      pre-checked new change, policy merge, galactica-style boxes) plus
 *      staleness units (.needs_update, fresh-window).
 *   2. Lifecycle harness — drives the REAL extension through a fake
 *      ExtensionAPI: session_start → tool_result → task flip → agent_end →
 *      session_shutdown, then a second instance for cross-session replay.
 *      Spawns are stubbed via fake `graphify`/`engram` executables on PATH
 *      that record invocations; the state file is isolated by pointing
 *      HOME at a tempdir BEFORE importing the modules (os.homedir() is
 *      resolved at executors.ts import time).
 *
 * Same in-process caveat as the real single-cwd design: module globals
 * (lastRun, graphFreshUntil) persist across the two harness instances —
 * the file-driven cross-session behavior is what's asserted, matching the
 * decided D2 semantics.
 */

import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── isolated HOME for the state file — MUST precede module imports ──────
const TMP = mkdtempSync(join(tmpdir(), "pirec-test-"));
const HOME = join(TMP, "home");
mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;

// ── fake spawn targets: record invocations, harmless output ─────────────
const BIN = join(TMP, "bin");
const RECORD = join(TMP, "record.jsonl");
mkdirSync(BIN, { recursive: true });
for (const cmd of ["graphify", "engram"]) {
  const p = join(BIN, cmd);
  writeFileSync(p, `#!/usr/bin/env node
require("node:fs").appendFileSync(
  process.env.PI_TEST_RECORD,
  JSON.stringify({ cmd: ${JSON.stringify(cmd)}, args: process.argv.slice(2), cwd: process.cwd() }) + "\\n",
);
console.log(${JSON.stringify(`fake-${cmd}-ok`)});
`);
  chmodSync(p, 0o755);
}
process.env.PI_TEST_RECORD = RECORD;
process.env.PATH = `${BIN}:${process.env.PATH ?? ""}`;
delete process.env.ENGRAM_PROJECT; // deterministic local-sync args in the harness

// ── module imports AFTER env is set ─────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const boundaries = await import("../boundaries.ts");
const policyMod = await import("../policy.ts");
const staleness = await import("../staleness.ts");
const executors = await import("../executors.ts");
const index = await import("../index.ts");

// ── tiny harness ─────────────────────────────────────────────────────────
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = fn(); if (v) return v; } catch { /* retry */ }
    await sleep(50);
  }
  return fn();
}
const recorder = () =>
  existsSync(RECORD)
    ? readFileSync(RECORD, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
const mkProj = (name) => {
  const p = join(TMP, name);
  mkdirSync(join(p, "openspec", "changes"), { recursive: true });
  return p;
};
const writeTasks = (proj, change, text, file = "4-tasks.md") => {
  const dir = join(proj, "openspec", "changes", change);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), text);
  return join(dir, file);
};

// ── Part 1: boundary units (plan item 6) ────────────────────────────────
{
  // T1 checkbox flip → tasksCompleted: 1
  const proj = mkProj("case1");
  writeTasks(proj, "alpha", "- [ ] step one\n- [ ] step two\n");
  const a = await boundaries.snapshot(proj);
  writeTasks(proj, "alpha", "- [x] step one\n- [ ] step two\n");
  const b = await boundaries.snapshot(proj);
  const d = boundaries.diff(a, b);
  check("T1 flip → tasksCompleted 1", d.tasksCompleted === 1, `got ${d.tasksCompleted}`);

  // T2 new archive dir → newArchives
  const c = await boundaries.snapshot(proj);
  mkdirSync(join(proj, "openspec", "changes", "archive", "2026-10-19-alpha"), { recursive: true });
  const e = await boundaries.snapshot(proj);
  const d2 = boundaries.diff(c, e);
  check("T2 new archive → newArchives", d2.newArchives.length === 1 && d2.newArchives[0] === "2026-10-19-alpha",
    JSON.stringify(d2.newArchives));

  // T3 archive move does NOT count as task completion
  const proj3 = mkProj("case3");
  writeTasks(proj3, "beta", "- [x] done thing\n- [x] done too\n");
  const a3 = await boundaries.snapshot(proj3);
  rmSync(join(proj3, "openspec", "changes", "beta"), { recursive: true, force: true });
  mkdirSync(join(proj3, "openspec", "changes", "archive", "2026-10-19-beta"), { recursive: true });
  const b3 = await boundaries.snapshot(proj3);
  const d3 = boundaries.diff(a3, b3);
  check("T3 archive move ≠ completion", d3.tasksCompleted === 0 && d3.newArchives.includes("2026-10-19-beta"),
    `tasks=${d3.tasksCompleted} archives=${JSON.stringify(d3.newArchives)}`);

  // T4 uncheck + recheck → net 0 (middle snapshot proves the unchecked state was observed)
  const proj4 = mkProj("case4");
  const f = writeTasks(proj4, "gamma", "- [x] box\n");
  const a4 = await boundaries.snapshot(proj4);
  writeFileSync(f, "- [ ] box\n"); // unchecked
  const mid4 = await boundaries.snapshot(proj4);
  check("T4a unchecked state observed", mid4.checkedTasks === 0, `got ${mid4.checkedTasks}`);
  writeFileSync(f, "- [x] box\n"); // rechecked
  const b4 = await boundaries.snapshot(proj4);
  check("T4 uncheck+recheck → 0", boundaries.diff(a4, b4).tasksCompleted === 0);

  // T5 new change dir with pre-checked boxes counts (documented semantics):
  // baseline = same project before the change existed (0 checked)
  const proj5 = mkProj("case5");
  const a5 = await boundaries.snapshot(proj5);
  writeTasks(proj5, "prechecked", "- [x] a\n- [x] b\n- [x] c\n");
  const b5 = await boundaries.snapshot(proj5);
  check("T5 pre-checked new change counts", boundaries.diff(a5, b5).tasksCompleted === 3,
    `got ${boundaries.diff(a5, b5).tasksCompleted}`);

  // T7 galactica-style bold boxes + case-insensitivity
  const proj7 = mkProj("case7");
  writeTasks(proj7, "gal", "- [x] **1.1 Do the thing**\n- [ ] **1.2 Other**\n- [X] **2.1 MORE**\n  - [x] nested plain\n");
  const s7 = await boundaries.snapshot(proj7);
  check("T7 galactica `- [x] **N.M**` counts", s7.checkedTasks === 3, `got ${s7.checkedTasks}`);
}

// T6 policy merge — array override replaces, object merge merges
{
  const proj = mkProj("case6");
  writeFileSync(join(proj, "sync-policy.json"), JSON.stringify({
    graphify: { when: ["agent_end_dirty"] },
    toolClasses: { code: ["customtool"] },
  }));
  const p = await policyMod.loadPolicy(proj);
  check("T6a array override replaces", JSON.stringify(p.graphify.when) === JSON.stringify(["agent_end_dirty"]),
    JSON.stringify(p.graphify.when));
  check("T6b object merge keeps siblings", p.graphify.minIntervalMs === policyMod.defaultPolicy.graphify.minIntervalMs,
    `${p.graphify.minIntervalMs}`);
  check("T6c nested array replace (toolClasses)", p.toolClasses.code.length === 1 && p.toolClasses.code[0] === "customtool");
  check("T6d untouched groups default", Array.isArray(p.toolClasses.memory) && p.toolClasses.memory.length === policyMod.defaultPolicy.toolClasses.memory.length);
}

// ── Part 2: staleness units ──────────────────────────────────────────────
{
  const proj = mkProj("stale");
  mkdirSync(join(proj, "graphify-out"), { recursive: true });
  const graph = join(proj, "graphify-out", "graph.json");
  writeFileSync(graph, "{}"); // now
  await sleep(20);
  mkdirSync(join(proj, "src"), { recursive: true });
  writeFileSync(join(proj, "src", "a.ts"), "export {};\n"); // newer than graph.json
  const ext = policyMod.defaultPolicy.graphify.codeExtensions;
  check("S1 newer code file → stale true", (await staleness.isGraphStale(proj, ext)) === true);
  check("S2 fresh-window suppresses", (await staleness.isGraphStale(proj, ext, Date.now() + 10_000)) === false);
  writeFileSync(join(proj, "graphify-out", ".needs_update"), "");
  check("S3 .needs_update marker → stale true", (await staleness.isGraphStale(proj, ext)) === true);
  rmSync(join(proj, "graphify-out", ".needs_update"), { force: true });
}

// ── Part 3: lifecycle harness (real extension, fake API, stubbed spawns) ─
{
  const proj = mkProj("harness");
  const tasksFile = writeTasks(proj, "alpha", "- [ ] implement feature\n");
  writeFileSync(join(proj, "sync-policy.json"), JSON.stringify({
    graphify: { minIntervalMs: 1000, guard: "none" },
    engram: { minIntervalMs: 60000 },
  }));

  const notes = [];
  const mkCtx = () => ({ cwd: proj, hasUI: true, ui: { notify: (m) => notes.push(m) } });
  const mkAPI = () => {
    const handlers = new Map();
    const commands = new Map();
    return {
      on: (ev, h) => handlers.set(ev, h),
      registerCommand: (name, def) => commands.set(name, def),
      handlers, commands,
      emit: async (ev, event = {}, ctx = mkCtx()) => {
        const h = handlers.get(ev);
        if (h) await h(event, ctx);
      },
    };
  };

  // Session 1: start → code tool → flip → agent_end → shutdown(reload)
  const api1 = mkAPI();
  index.default(api1);
  await api1.emit("session_start", { type: "session_start", reason: "startup" });
  await api1.emit("tool_result", { type: "tool_result", toolName: "edit" });
  writeFileSync(tasksFile, "- [x] implement feature\n");
  await api1.emit("agent_end", { type: "agent_end" });

  const fired1 = await waitFor(() => recorder().some((r) => r.cmd === "graphify"));
  check("L1 task flip at agent_end fires graphify once",
    fired1 && recorder().filter((r) => r.cmd === "graphify").length === 1,
    JSON.stringify(recorder().filter((r) => r.cmd === "graphify").map((r) => r.args)));
  check("L1b args are `update .`", recorder().some((r) => r.cmd === "graphify" && r.args[0] === "update" && r.args[1] === "."));

  await api1.emit("session_shutdown", { type: "session_shutdown", reason: "reload" });
  const stateFile = join(HOME, ".pi", "agent", "pi-reconcile-state.json");
  check("L2 shutdown persisted state", existsSync(stateFile));
  const persisted = JSON.parse(readFileSync(stateFile, "utf8"));
  const entry = persisted?.projects?.[proj];
  check("L2b entry has snapshot+lastRun+graphFreshUntil",
    !!entry && entry.snapshot?.present === true && typeof entry.lastRun?.graphify === "number" && typeof entry.graphFreshUntil === "number",
    JSON.stringify(entry ?? null));
  check("L3 reload shutdown does NOT fire engram fallback (quit-gate)",
    recorder().filter((r) => r.cmd === "engram").length === 0);

  // "pi closed": archive the change on disk
  mkdirSync(join(proj, "openspec", "changes", "archive", "2026-10-19-alpha"), { recursive: true });
  rmSync(join(proj, "openspec", "changes", "alpha"), { recursive: true, force: true });

  // Session 2 (fresh instance): cross-session replay must fire engram
  const api2 = mkAPI();
  index.default(api2);
  await api2.emit("session_start", { type: "session_start", reason: "startup" });
  const fired2 = await waitFor(() => recorder().some((r) => r.cmd === "engram"));
  const engramCalls = recorder().filter((r) => r.cmd === "engram");
  check("L4 archive crossed while closed → replay fires engram", fired2 && engramCalls.length === 1,
    JSON.stringify(engramCalls.map((r) => r.args)));
  check("L4b local sync args (exactly `sync`)", engramCalls.length === 1 && engramCalls[0].args.length === 1 && engramCalls[0].args[0] === "sync");

  // /reconcile force: engram inside 60s cooldown → visible reason
  notes.length = 0;
  await api2.commands.get("reconcile").handler("", mkCtx());
  const forceNote = notes.find((n) => n.includes("pi-reconcile:"));
  check("L5 force during cooldown reports engram cooldown", !!forceNote && forceNote.includes("engram=cooldown"), forceNote ?? "no note");

  // /reconcile status: log names + tail of newest log (fake bin's output line)
  notes.length = 0;
  await waitFor(() => {
    const logDir = join(proj, ".pi-reconcile", "logs");
    return existsSync(logDir) && readdirSync(logDir).some((f) => f.startsWith("graphify-"));
  });
  await api2.commands.get("reconcile").handler("status", mkCtx());
  const logNote = notes.find((n) => n.startsWith("pi-reconcile logs:"));
  const engramListed = !!logNote && (logNote.includes("engram-") || logNote.includes("engram: logs: none"));
  check("L6 status lists log names", !!logNote && logNote.includes("graphify-") && engramListed, logNote ?? "no note");
  check("L7 status tails newest log", !!logNote && logNote.includes("fake-graphify-ok"), logNote ?? "no note");

  // Retention: 12 seeded logs + 1 spawn → 10 kept
  const logDir = join(proj, ".pi-reconcile", "logs");
  mkdirSync(logDir, { recursive: true });
  for (let i = 0; i < 12; i++) {
    writeFileSync(join(logDir, `testkey-2000-01-01T00-00-${String(i).padStart(2, "0")}-000Z.log`), "old\n");
  }
  const r = executors.runBackground("testkey", "graphify", ["update", "."], proj, logDir, 0);
  const kept = executors.keyLogs(logDir, "testkey");
  const spawnedName = r.logFile ? r.logFile.split("/").pop() : undefined;
  check("L8 retention keeps newest 10", r.started && kept.length === 10, `kept ${kept.length}`);
  check("L8b oldest unlinked", !kept.includes("testkey-2000-01-01T00-00-00-000Z.log") && !kept.includes("testkey-2000-01-01T00-00-01-000Z.log"));
  check("L8c just-created log survives", !!spawnedName && kept.includes(spawnedName), spawnedName ?? "no logFile");
}

// ── result ───────────────────────────────────────────────────────────────
console.log(failures === 0 ? "\ntest matrix: all green" : `\ntest matrix: ${failures} failure(s)`);
if (failures === 0) {
  rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}
console.error(`fixture kept for debugging: ${TMP}`);
process.exit(1);
