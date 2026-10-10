import { loadDbEnv, connectDirect } from "./lib/direct-db";
import { loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";
import { resolve } from "node:path";
import type pg from "pg";
export async function open(): Promise<pg.Client> {
  const root = resolve(import.meta.dirname, "..");
  const env = process.env.CLONE ? loadCloneDbEnv(root, loadCloneRef(root) as any) : loadDbEnv();
  if ("missing" in env) throw new Error("no env " + env.missing.join());
  return connectDirect(env, "dd4-proof", (n) => { if (process.env.NOTICES) console.log("[N]", n.message); });
}
export async function q(c: pg.Client, sql: string, params: any[] = []) { return (await c.query(sql, params)).rows; }
