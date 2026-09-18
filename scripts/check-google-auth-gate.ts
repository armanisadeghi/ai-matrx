#!/usr/bin/env npx tsx
/**
 * check:google-auth-gate — ONE Google authorization window per PERSON.
 *
 * V-23 NEW-3 (2026-09-18): "one window at a time" was true per COMPONENT and
 * covered 2 of 19 call sites. `useGoogleConsentRunner` held a `useRef`, so two
 * mounted surfaces each held their own lock; the other seventeen sites called
 * `google.requestAuthorizationCode(...)` / `.startAuthorizationCodeRedirect(...)`
 * straight off the provider context, behind nothing but a local `busy` state set
 * inside an async handler. Two presses opened two Google windows for one intent.
 *
 * The repair is a module-level gate every window request passes through
 * (`providers/google-provider/googleAuthorizationGate.ts`), reached through the
 * one door `useGoogleAuthorizationWindow()`. This check keeps it the ONE door:
 *
 * WHAT THIS FLAGS: any file outside `providers/google-provider/` that names
 * `requestAuthorizationCode` or `startAuthorizationCodeRedirect` — the raw
 * provider primitives. Surfaces call `openAuthorizationWindow` /
 * `openAuthorizationRedirect` (and `beginAuthorization` when they must hold the
 * gate across their own awaits) instead.
 *
 * Test files are NOT scanned: a suite stands the provider module itself in with
 * `jest.mock("@/providers/google-provider/GoogleApiProvider", ...)`, and that
 * stand-in must keep the provider's own method names — it is the owner module,
 * not a bypass. Shipped code is what this guard is about.
 *
 * Exit 1 on any finding. `--self-test` proves the check can fail.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = process.cwd();
const SELF_TEST = process.argv.includes("--self-test");
const SCAN_DIRS = ["features", "components", "app", "lib", "hooks", "providers", "utils"];

/** The raw primitives. Naming one outside the provider directory is the defect. */
const RAW_PRIMITIVES = /\b(requestAuthorizationCode|startAuthorizationCodeRedirect)\b/g;

/**
 * The provider directory owns the primitives, the gate and the one door.
 * Nothing else is allowed to name them — there is no per-file allowlist,
 * because a per-file allowlist is how the last lock grew to 19 call sites.
 */
const OWNER_DIR = "providers/google-provider/";

export function rawPrimitiveUses(
  relPath: string,
  source: string,
): { line: number; text: string }[] {
  if (relPath.startsWith(OWNER_DIR)) return [];
  if (/\.(test|spec)\.tsx?$/.test(relPath)) return [];
  const findings: { line: number; text: string }[] = [];
  source.split("\n").forEach((text, index) => {
    if (new RegExp(RAW_PRIMITIVES.source).test(text)) {
      findings.push({ line: index + 1, text: text.trim() });
    }
  });
  return findings;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function selfTest(): void {
  const bypass = rawPrimitiveUses(
    "features/google-workspace/GoogleWorkspaceConnectBody.tsx",
    "      const code = await google.requestAuthorizationCode([\n",
  );
  const bypassRedirect = rawPrimitiveUses(
    "features/marketing/google/ReadOnlySweepWorkspace.tsx",
    "        await google.startAuthorizationCodeRedirect(\n",
  );
  const throughTheDoor = rawPrimitiveUses(
    "features/google-workspace/GoogleWorkspaceConnectBody.tsx",
    "      const code = await googleAuth.openAuthorizationWindow([\n",
  );
  const owner = rawPrimitiveUses(
    "providers/google-provider/GoogleApiProvider.tsx",
    "  const requestAuthorizationCode = async (\n",
  );
  const providerStandIn = rawPrimitiveUses(
    "features/google-workspace/a-picked-doc-opens-as-its-record.test.tsx",
    "    requestAuthorizationCode: jest.fn(),\n",
  );
  const ok =
    bypass.length === 1 &&
    bypassRedirect.length === 1 &&
    throughTheDoor.length === 0 &&
    owner.length === 0 &&
    providerStandIn.length === 0;
  if (!ok) {
    console.error(
      "check:google-auth-gate self-test FAILED — the check no longer tells a raw provider call from a call through the one door.",
    );
    exitAfterDrain(1);
  }
  console.log(
    "check:google-auth-gate self-test PASSED — a raw provider authorization call is caught; the one door, the provider directory and a provider stand-in in a test are not.",
  );
  exitAfterDrain(0);
}

function main(): void {
  if (SELF_TEST) {
    selfTest();
    return;
  }
  const findings: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split("\\").join("/");
      for (const hit of rawPrimitiveUses(rel, readFileSync(file, "utf8"))) {
        findings.push(`${rel}:${hit.line}  ${hit.text}`);
      }
    }
  }
  if (findings.length) {
    console.error(
      `check:google-auth-gate FAILED — ${findings.length} place(s) name a raw Google authorization primitive outside ${OWNER_DIR}.`,
    );
    console.error(
      "A raw call bypasses the one-person, one-window gate: two presses open two Google consent windows for one intent (V-23 NEW-3).",
    );
    console.error(
      "Remedy: useGoogleAuthorizationWindow() → openAuthorizationWindow / openAuthorizationRedirect, and beginAuthorization() when you must hold the gate across your own awaits.",
    );
    for (const finding of findings) console.error(`  ${finding}`);
    exitAfterDrain(1);
  }
  console.log(
    `check:google-auth-gate PASSED — every Google authorization window request goes through ${OWNER_DIR}.`,
  );
  exitAfterDrain(0);
}

main();
