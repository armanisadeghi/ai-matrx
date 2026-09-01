#!/usr/bin/env tsx
/**
 * check-split-jar-doors.ts — EVERY Supabase auth door must read a
 * duplicate-preserving cookie view. A door that reads Next's collapsed jar
 * cannot see a split cookie jar, and silently answers a coin flip.
 *
 * THE CLASS (`@ai-matrx/data` 0.7.0 → 0.8.0, a production outage). Next's
 * `RequestCookies` — and the `cookies()` store built on it — keys its jar by
 * cookie NAME. Two same-name auth cookies at two `Domain` scopes have therefore
 * ALREADY collapsed to one before any application code runs, and the survivor
 * is whichever copy the browser happened to send LAST:
 *
 *     "sb-…-v2.0=; sb-…-v2.0=base64-REAL"   ->  the session
 *     "sb-…-v2.0=base64-REAL; sb-…-v2.0="   ->  anonymous
 *
 * On `www.aimatrx.com` that coin flip showed a signed-in admin shell "Mine 0"
 * against 686 jobs; on `manage.aimatrx.com` a valid Create answered
 * "Authentication required". No amount of care over `getAll()` finds it — the
 * duplicates are gone by then.
 *
 * THE RULE. Every `supabaseNext.middlewareSession` / `serverClient` /
 * `routeClient` call must reach the raw `Cookie` header one of two ways:
 *
 *   1. pass `cookieHeader:` (the door's own option — the normal way); or
 *   2. build its `cookieStore.getAll` / `requestCookies.getAll` view from
 *      `parseCookieHeader(...)`, for a door that also shapes the jar (the
 *      option REPLACES the host view, so a shaped door must use this form —
 *      `app/auth/callback/route.ts` aliases a historical verifier name).
 *
 * A door doing NEITHER is the defect. This guard reads each call site's
 * argument text and fails on that case.
 *
 * Modes:
 *   default     — advisory: loud report, exit 0
 *   --strict    — exit 1 on any blind door
 *   --self-test — plant a known-blind door in memory and prove this guard
 *                 reports it (a guard that cannot fail is not a guard)
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const DOORS = ["middlewareSession", "serverClient", "routeClient"] as const;

interface Finding {
  file: string;
  line: number;
  door: string;
}

/** The argument text of `supabaseNext.<door>({ … })`, brace-balanced. */
function doorCalls(source: string): { door: string; args: string; at: number }[] {
  const out: { door: string; args: string; at: number }[] = [];
  for (const door of DOORS) {
    const needle = `supabaseNext.${door}(`;
    let from = 0;
    for (;;) {
      const start = source.indexOf(needle, from);
      if (start === -1) break;
      let depth = 0;
      let end = start + needle.length - 1;
      for (let i = end; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      out.push({ door, args: source.slice(start, end + 1), at: start });
      from = end + 1;
    }
  }
  return out;
}

function blindDoors(file: string, source: string): Finding[] {
  const usesParsedHeader = source.includes("parseCookieHeader");
  const findings: Finding[] = [];
  for (const call of doorCalls(source)) {
    if (/\bcookieHeader\s*:/.test(call.args)) continue;
    // A shaped door builds its own duplicate-preserving view instead.
    if (usesParsedHeader) continue;
    findings.push({
      file,
      line: source.slice(0, call.at).split("\n").length,
      door: call.door,
    });
  }
  return findings;
}

function trackedFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "*.ts", "*.tsx"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\n").filter(Boolean);
}

if (SELF_TEST) {
  const planted = `
    import { supabaseNext } from "@/utils/supabase/authCookie";
    export const c = supabaseNext.serverClient({
      cookieStore,
      host: h.get("host"),
    });
  `;
  const found = blindDoors("planted.ts", planted);
  if (found.length !== 1) {
    console.error(
      `SELF-TEST FAILED: a door with no cookieHeader and no parseCookieHeader ` +
        `was not reported (found ${found.length}).`,
    );
    process.exit(1);
  }
  const clean = planted.replace(
    "host: h.get(\"host\"),",
    "host: h.get(\"host\"), cookieHeader: h.get(\"cookie\"),",
  );
  if (blindDoors("planted.ts", clean).length !== 0) {
    console.error("SELF-TEST FAILED: a door WITH cookieHeader was reported.");
    process.exit(1);
  }
  console.log("check:split-jar-doors self-test PASSED (it can fail).");
  process.exit(0);
}

const findings: Finding[] = [];
let doorCount = 0;
for (const file of trackedFiles()) {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  if (!source.includes("supabaseNext.")) continue;
  doorCount += doorCalls(source).length;
  findings.push(...blindDoors(file, source));
}

if (findings.length === 0) {
  console.log(
    `check:split-jar-doors OK — ${doorCount} auth door(s), every one reading a ` +
      `duplicate-preserving cookie view.`,
  );
  process.exit(0);
}

console.error(
  `check:split-jar-doors: ${findings.length} of ${doorCount} auth door(s) read ` +
    `the COLLAPSED cookie jar and cannot see a split jar:\n`,
);
for (const f of findings) {
  console.error(
    `  ${relative(ROOT, f.file)}:${f.line}  supabaseNext.${f.door}(…)\n` +
      `    fix: pass \`cookieHeader: <raw Cookie header>\`, or build the door's ` +
      `cookie view from \`parseCookieHeader\` (@ai-matrx/data/db).`,
  );
}
process.exit(STRICT ? 1 : 0);
