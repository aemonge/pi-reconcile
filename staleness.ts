/**
 * Staleness guards: is the graphify graph actually out of date?
 *
 * Two cheap deterministic signals, no git required:
 *   1. graphify-out/needs_update exists (graphify's own marker; the
 *      dot-variant .needs_update the graphify skill cleans counts too)
 *   2. any code file is newer than graphify-out/graph.json (mtime via find)
 *
 * `freshUntilMs` (optional): epoch-ms until which the graph is known-fresh
 * because WE just rebuilt it. Inside the window return false immediately —
 * graphify leaves outputs untouched on no-op updates, so mtime cannot have
 * moved past graph.json yet (touch-loop mitigation, research §3).
 *
 * find(1) portability (research §6): linux → GNU syntax; darwin → BSD
 * `find -E . -regex …` (no -regextype); win32 + everything else →
 * "unknown" explicitly — callers fail open, cooldown still bounds spawns.
 *
 * Returns "unknown" when the check itself fails (timeout, perms) — callers
 * treat that conservatively.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Staleness = boolean | "unknown";

export async function isGraphStale(
  cwd: string,
  codeExtensions: string,
  freshUntilMs?: number,
): Promise<Staleness> {
  // Known-fresh window first: truthful on every platform (we spawned
  // graphify moments ago), so it precedes even the platform branch.
  if (freshUntilMs !== undefined && Date.now() < freshUntilMs) return false;
  const out = join(cwd, "graphify-out");
  if (!existsSync(out)) return false; // graphify not used in this repo
  // graphify's watch layer writes `needs_update`; the graphify skill also
  // cleans a dot-variant `.needs_update` (SKILL.md:635) — check both.
  if (existsSync(join(out, "needs_update")) || existsSync(join(out, ".needs_update"))) return true;
  const graph = join(out, "graph.json");
  if (!existsSync(graph)) return true;

  const platform = process.platform;
  if (platform !== "linux" && platform !== "darwin") {
    // No find(1) on win32; other platforms unverified. Intentional
    // "unknown" (replaces the accidental ENOENT → catch → unknown path):
    // callers fail open (stale !== false → allow), cooldown bounds spawns.
    return "unknown";
  }
  // GNU: -regextype AFTER the path. BSD (macOS): -E BEFORE the path, no
  // -regextype. Remaining primaries (-newer/-regex/-not/-path/-print/-quit)
  // are identical on both; -regex matches the whole path on both.
  const regexArgs = platform === "darwin"
    ? ["-E", ".", "-newer", graph, "-regex", `.*\\.(${codeExtensions})`]
    : [".", "-newer", graph, "-regextype", "posix-extended", "-regex", `.*\\.(${codeExtensions})`];
  try {
    const { stdout } = await run(
      "find",
      [
        ...regexArgs,
        "-not", "-path", "./node_modules/*",
        "-not", "-path", "./graphify-out/*",
        "-not", "-path", "./openspec/*",
        "-not", "-path", "./.git/*",
        "-not", "-path", "./.pi-reconcile/*",
        "-print", "-quit", // stop at the first hit — we only need existence
      ],
      { cwd, timeout: 15_000 },
    );
    return stdout.trim().length > 0;
  } catch {
    return "unknown";
  }
}
