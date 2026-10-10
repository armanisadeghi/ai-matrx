#!/usr/bin/env node
// One command:  node tests/safety-net/run.mjs [journeyId ...]      (or: pnpm test:safety-net)
// Journeys: j1-auth-org j2-records j3-files j4-chat j5-notes-assoc j6-surfaces
// Fault proof: SAFETYNET_FAULT=j1-auth-org node tests/safety-net/run.mjs j1-auth-org   (must go RED)
import { readdirSync, writeFileSync } from "node:fs";
import { openSession, makeCtx, OUT } from "./lib/harness.mjs";

const dir = new URL("./journeys/", import.meta.url);
const want = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort()
  .filter((f) => !want.length || want.some((w) => f.startsWith(w)));
const results = [];
for (const f of files) {
  const mod = await import(new URL(f, dir));
  const j = mod.default;
  const ctx = makeCtx(j.id);
  const t0 = Date.now();
  console.log(`\n== ${j.id}: ${j.title}`);
  let s = null;
  try {
    s = await openSession({ signedIn: j.signIn !== false });
    Object.assign(ctx, { s });
    await j.run(ctx);
  } catch (e) {
    ctx.check("journey ran to the end", false, String(e?.message ?? e).split("\n")[0]);
  } finally {
    await s?.browser?.close().catch(() => undefined);
  }
  const real = ctx.checks.filter((c) => !c.note);
  const failed = real.filter((c) => !c.ok);
  results.push({ id: j.id, title: j.title, pass: failed.length === 0 && real.length > 0, checks: real.length, failed: failed.map((c) => `${c.name}: ${c.detail}`), seconds: Math.round((Date.now() - t0) / 1000) });
}
console.log("\n| journey | result | checks | seconds | first failure |\n|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.id} | ${r.pass ? "PASS" : "FAIL"} | ${r.checks} | ${r.seconds} | ${r.failed[0] ?? ""} |`);
writeFileSync(`${OUT}/results-${Date.now()}.json`, JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
