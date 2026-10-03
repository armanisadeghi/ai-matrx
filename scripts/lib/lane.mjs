/**
 * lane.mjs — THE ONE NAME A LANE'S DATABASE CONNECTIONS CARRY (2026-10-03, clone crash-loop).
 *
 * Twelve lanes shared one clone and every statement arrived as application "Supavisor", so the lane that
 * ran the heavy function could not be named (common-docs v6/CLONE-CRASH-2026-10-03.md). Every connection a
 * script opens now sets application_name to `<lane>:<what it is>`.
 *
 * The lane is MATRX_LANE (db:apply / db:rehearse set it from `--lane`), else the git user name, else "unnamed".
 */
import { spawnSync } from "node:child_process";

export function laneName(env = process.env) {
  let raw = (env.MATRX_LANE ?? "").trim();
  if (!raw) {
    try {
      const r = spawnSync("git", ["config", "user.name"], { encoding: "utf8", timeout: 2000 });
      raw = r.status === 0 ? (r.stdout ?? "").trim() : "";
    } catch {
      raw = "";
    }
  }
  const clean = raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || "unnamed";
}

/** `<lane>:<app>`, cut to Postgres's 63-byte application_name limit (the lane keeps its place at the front). */
export function laneApp(app, env = process.env) {
  return `${laneName(env)}:${app ?? ""}`.slice(0, 63);
}
