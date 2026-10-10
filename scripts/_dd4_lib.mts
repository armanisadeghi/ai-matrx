import { loadDbEnv, connectDirect } from "./lib/direct-db";
import type pg from "pg";
export async function open(): Promise<pg.Client> {
  const env = loadDbEnv();
  if ("missing" in env) throw new Error("no env " + env.missing.join());
  return connectDirect(env, "dd4-proof", (n) => { if (process.env.NOTICES) console.log("[N]", n.message); });
}
export async function q(c: pg.Client, sql: string, params: any[] = []) { return (await c.query(sql, params)).rows; }
