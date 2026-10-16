/**
 * Staleness guards: is the graphify graph actually out of date?
 *
 * Two cheap deterministic signals, no git required:
 *   1. graphify-out/needs_update exists (graphify's own marker)
 *   2. any code file is newer than graphify-out/graph.json (mtime via find)
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
): Promise<Staleness> {
  const out = join(cwd, "graphify-out");
  if (!existsSync(out)) return false; // graphify not used in this repo
  if (existsSync(join(out, "needs_update"))) return true;
  const graph = join(out, "graph.json");
  if (!existsSync(graph)) return true;

  try {
    const { stdout } = await run(
      "find",
      [
        ".",
        "-newer", graph,
        "-regextype", "posix-extended",
        "-regex", `.*\\.(${codeExtensions})`,
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
