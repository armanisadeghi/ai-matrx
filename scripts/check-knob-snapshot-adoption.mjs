#!/usr/bin/env node
/**
 * check:knob-snapshot-adoption — the client fetches the WHOLE resolved
 * register once, never one setting at a time.
 *
 * THE RULING THIS ENFORCES (Arman, 2026-09-20): *"the one thing that
 * absolutely cannot happen is that we can't be fetching individual
 * configurations for everything that we do, and we can't be trying to do these
 * things live or through any sort of application level logic regardless of if
 * it's a server or the client."*
 *
 * THE STATE IT REPLACED. Until that day every knob a screen read was its own
 * `platform.knob_resolve` round trip. The Masterwork record surface opened five
 * on mount, the Question Desk five more, Masterwork drive five more; a page
 * carrying two of them paid ten network calls to learn ten small values, and
 * the cost of consulting a setting was high enough that the honest move was to
 * stop consulting settings — which is law 6 ("opinions become knobs") dying
 * quietly. `platform.knob_snapshot` answers all 870 keys for one person in one
 * organization in 44 kB and 47 ms, so `lib/scoped-config/effectiveKnobs.ts`
 * fetches THAT once per (organization, user, scope address) and every read
 * after it is a `Map` lookup.
 *
 * WHY A GUARD AND NOT A COMMENT. This decays back in one commit: the next agent
 * needing one value in one place writes one `rpc("knob_resolve", …)` because it
 * is three lines and it works. It works for that agent and costs the platform a
 * round trip per setting for ever. So the per-knob network resolve is refused by
 * name, in this repo, with the remedy.
 *
 * WHAT IS NOT A FINDING. `platform.knob_index` is a different question — the
 * SETTINGS SCREEN's per-rung read (origin, lock, platform default, out-of-range)
 * for a whole feature prefix in one call. It is already one call for many keys
 * and stays. `platform.knob_resolve` itself stays in the database: it is what
 * `knob_snapshot` is built on, key by key, so there is exactly one resolver and
 * it cannot drift from itself.
 *
 * Usage:
 *   node scripts/check-knob-snapshot-adoption.mjs
 *   node scripts/check-knob-snapshot-adoption.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * A single-knob resolve going over the wire: `.rpc("knob_resolve", …)` in any
 * spelling. Matched on the RPC NAME next to an `rpc(` call, so prose, a comment
 * naming the function, and the database's own use of it are all untouched.
 */
const PER_KNOB_RESOLVE = /\brpc\s*\(\s*["'`]knob_resolve["'`]/;

/**
 * The only files allowed to carry the shape, each because it EXISTS to police
 * `knob_resolve` rather than to call it — `pnpm check:knob-resolve-callers`
 * (DD-198) classifies every call site's `p_scopes` argument in the live catalog
 * and in both repos' source, so its classifier and its fixtures must spell the
 * function out. An entry here that the scan no longer finds FAILS as stale: the
 * list only shrinks, so a file that stops needing the exemption loses it.
 */
const ALLOWED = new Map([
  [
    "scripts/knob-resolve-callers/core.ts",
    "the classifier behind check:knob-resolve-callers — it reads call sites, it makes none",
  ],
  [
    "scripts/__tests__/check-knob-resolve-callers.test.ts",
    "that classifier's fixtures, which must contain the shape to prove it is caught",
  ],
]);

/** The module that owns the one fetch, and the symbol that must still be in it. */
const OWNER = "lib/scoped-config/effectiveKnobs.ts";
const OWNER_MUST_CONTAIN = ['rpc("knob_snapshot"', "export function ensureKnobSnapshot"];

function trackedSourceFiles() {
  const out = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

function findingsIn(file, text) {
  const findings = [];
  text.split("\n").forEach((line, i) => {
    if (PER_KNOB_RESOLVE.test(line)) findings.push({ file, line: i + 1, text: line.trim() });
  });
  return findings;
}

function selfTest() {
  const shouldFail = `const { data } = await supabase.schema("platform").rpc("knob_resolve", { p_key: k });`;
  const shouldPass = [
    `// platform.knob_resolve is what knob_snapshot is built on, key by key.`,
    `const { data } = await supabase.schema("platform").rpc("knob_snapshot", { p_user_id: u });`,
    `const { data } = await supabase.schema("platform").rpc("knob_index", { p_feature_prefix: f });`,
    `if (fn === "knob_resolve") return null; // a name compared, not a call`,
  ];
  const caught = findingsIn("fixture.ts", shouldFail).length === 1;
  const quiet = shouldPass.every((l) => findingsIn("fixture.ts", l).length === 0);
  if (!caught) {
    console.error("❌ self-test: the detector did NOT catch a per-knob network resolve.");
    process.exit(1);
  }
  if (!quiet) {
    console.error("❌ self-test: the detector fired on a line that is not a per-knob resolve.");
    process.exit(1);
  }
  console.log("✅ check:knob-snapshot-adoption self-test — it catches the real shape and nothing else.");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const findings = [];
  for (const file of trackedSourceFiles()) {
    let text;
    try {
      text = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue; // deleted in the index but still listed
    }
    findings.push(...findingsIn(file, text));
  }

  const exempted = new Set(findings.filter((f) => ALLOWED.has(f.file)).map((f) => f.file));
  const offenders = findings.filter((f) => !ALLOWED.has(f.file));
  const stale = [...ALLOWED.keys()].filter((f) => !exempted.has(f));

  const owner = readFileSync(path.join(ROOT, OWNER), "utf8");
  const missing = OWNER_MUST_CONTAIN.filter((needle) => !owner.includes(needle));

  if (offenders.length === 0 && stale.length === 0 && missing.length === 0) {
    console.log(
      "✅ check:knob-snapshot-adoption — settings are read as ONE snapshot per " +
        "(organization, user, scopes); no client code resolves a single knob over the network.",
    );
    return;
  }

  if (offenders.length > 0) {
    console.error(
      "❌ A SETTING IS BEING FETCHED ONE AT A TIME. Every read below opens its own " +
        "round trip for one small value:\n",
    );
    for (const f of offenders) console.error(`   ${f.file}:${f.line}  ${f.text}`);
    console.error(
      "\n   Remedy: read it through `useEffectiveKnob` / `ensureEffectiveKnob` / " +
        "`useSessionKnob` (lib/scoped-config). They answer from the one cached " +
        "`platform.knob_snapshot` — adding a knob to a screen costs nothing at run time.\n" +
        "   The settings SCREEN's per-rung read is `platform.knob_index`, which is " +
        "already one call for a whole feature prefix.",
    );
  }
  if (stale.length > 0) {
    console.error(
      "\n❌ STALE EXEMPTION — these files no longer carry the shape, so their entry in " +
        "ALLOWED is measuring nothing and would silently cover a real call later:\n" +
        stale.map((f) => `   ${f}`).join("\n") +
        "\n   Remedy: delete the entry from ALLOWED in this script.",
    );
  }
  if (missing.length > 0) {
    console.error(
      `\n❌ ${OWNER} no longer carries the one fetch — missing: ${missing.join(", ")}.\n` +
        "   Without it every consumer in this repo is reading from nothing, and this " +
        "guard is measuring a rule that no code implements.",
    );
  }
  process.exit(1);
}

main();
