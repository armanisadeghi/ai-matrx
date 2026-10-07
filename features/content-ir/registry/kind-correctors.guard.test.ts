/**
 * THE GUARD: no render path may build an envelope around the correction step.
 *
 * Every envelope this app builds comes from one of three kernel constructors. The host
 * may call them ONLY through `kind-correctors.ts` (which corrects a kind's value against
 * its own rules before any renderer sees it), so a NEW path inherits the correction — or
 * this test names the file and the line. Found 2026-09-29: the shape preview's streaming,
 * reload and partial paths all built envelopes directly and showed a draft_critique's
 * stated 17 points / 6 of 10 while its criteria summed to 3.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components", "features", "../aidream/apps/shared/chat/src", "lib", "hooks", "utils"];
const OWNER = "features/content-ir/registry/kind-correctors.ts";
// The chat package's bare-host stand-in for the `sessionEnvelope` slot (a host with NO correctors
// takes the session's own envelope, reported once). Every real host registers `sessionEnvelope`
// from OWNER (providers/chatContentIrRegistration.ts), so no render path in this app uses it.
const BARE_HOST_STAND_IN = "../aidream/apps/shared/chat/src/host/content-ir-slots.ts";

function files(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      files(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const RAW_IMPORT = /import\s*\{[^}]*\b(envelopeFromCompleteValue|normalizeJsonRegion)\b[^}]*\}\s*from\s*"@ai-matrx\/content-ir(?:\/core)?"/;
const RAW_SESSION_BUILD = /\.buildEnvelope\(\)/;

describe("every envelope goes through the kind-correction step", () => {
  const all = SCAN.flatMap((d) => files(join(ROOT, d)));

  it("scans the app", () => {
    expect(all.length).toBeGreaterThan(1000);
  });

  it("no host file imports a raw envelope constructor", () => {
    const offenders = all
      .map((f) => ({ f: relative(ROOT, f), s: readFileSync(f, "utf8") }))
      .filter(({ f, s }) => f !== OWNER && RAW_IMPORT.test(s))
      .map(({ f }) => f);
    expect(offenders).toEqual([]);
  });

  it("no host file reads a ParseSession envelope without sessionEnvelope()", () => {
    const offenders: string[] = [];
    for (const file of all) {
      const rel = relative(ROOT, file);
      if (rel === OWNER || rel === BARE_HOST_STAND_IN || rel.startsWith("app/(dev)/")) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (RAW_SESSION_BUILD.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//")) {
            offenders.push(`${rel}:${i + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
