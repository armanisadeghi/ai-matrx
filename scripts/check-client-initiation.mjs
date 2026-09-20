#!/usr/bin/env node
/**
 * BLOCKING guard: a first-party client surface must DECLARE how the run began.
 *
 * `origin_class` is the witnessed trust axis (see
 * packages/matrx-connect/matrx_connect/context/provenance.py). For an HTTP
 * request the server can only derive `human` / `client_auto` from the client's
 * own `initiation` attestation — and when the body omits it, the honest answer
 * is `api`: an unattested HTTP caller. That default is right for curl, coding
 * agents and third-party integrations, and WRONG for our own screens: a person
 * typing into the Conductor dock produced rows that read as machine traffic
 * (live census 2026-09-20: 46 Conductor + 25 canvas/Steward requests in the
 * Workflow Studio, and this repo's own mandate doors alongside them).
 *
 * So: any object literal in this repo's client apps that stamps `source_app`
 * (or `sourceApp`) for a first-party app AND carries a conversation run-door
 * marker (`user_input`, `is_new`, `prior_messages`) must also carry
 * `initiation`. Stamping it `"auto"` is always available and always honest —
 * the guard demands a DECISION, never a particular answer.
 *
 * Reads are never flagged: a filter, a column, a facet or a display label may
 * mention `source_app` freely because it carries no run-door marker.
 *
 * `--self-test` proves the guard can fail: it runs the same checker over a
 * planted sample that omits `initiation` and exits non-zero unless that sample
 * is reported.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Client trees whose code runs in a person's browser. */
const SCAN_ROOTS = ["actions", "app", "components", "features", "hooks", "lib", "utils"];

const EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "__tests__",
  "python-generated",
]);

/**
 * `source_app` values that are OUR OWN screens. `code-plugin` is deliberately
 * absent: an outside coding tool IS an API caller, and `api` is its truth.
 */
const FIRST_PARTY_APPS = new Set([
  "workflow-studio",
  "dashboard",
  "matrx-frontend",
  "matrx-admin",
  "matrx-desktop",
  "matrx-extend",
  "matrx-local",
  "chat",
]);

/** A literal that carries one of these is starting/continuing an AI run. */
const RUN_DOOR_MARKERS = ["user_input:", "is_new:", "prior_messages:"];

function walk(dir, files) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    const name = entry.name;
    if (!EXTENSIONS.has(path.extname(name))) continue;
    if (name.includes(".test.") || name.includes(".spec.") || name.endsWith(".d.ts")) continue;
    files.push(path.join(dir, name));
  }
  return files;
}

/** The object literal surrounding `index`, as source text, or null. */
function enclosingObjectLiteral(source, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(start, i + 1), start };
    }
  }
  return null;
}

const STAMP = /(?:^|[\s,{(])(source_app|sourceApp)\s*:/g;

/**
 * The app this literal stamps, when it can be read statically. A non-literal
 * value (`options.sourceApp`, a variable) is treated as first-party: a client
 * tree is where client surfaces live, and a helper that leaves the app open
 * still runs in a browser.
 */
function stampedAppIsFirstParty(literal, matchIndex) {
  const after = literal.slice(matchIndex);
  const quoted = after.match(/^(?:source_app|sourceApp)\s*:\s*["'`]([^"'`]+)["'`]/);
  if (!quoted) return true;
  return FIRST_PARTY_APPS.has(quoted[1]);
}

export function findings(files, readFile = (f) => fs.readFileSync(f, "utf8")) {
  const found = [];
  for (const file of files) {
    const source = readFile(file);
    if (!source.includes("source_app") && !source.includes("sourceApp")) continue;
    const seen = new Set();
    for (const match of source.matchAll(STAMP)) {
      const at = match.index + match[0].indexOf(match[1]);
      const literal = enclosingObjectLiteral(source, at);
      if (!literal || seen.has(literal.start)) continue;
      seen.add(literal.start);
      if (!RUN_DOOR_MARKERS.some((marker) => literal.text.includes(marker))) continue;
      if (!stampedAppIsFirstParty(literal.text, at - literal.start)) continue;
      // `initiation: x`, the shorthand `initiation,`, `...{ initiation }` and
      // a type member's `initiation?:` all declare it.
      if (/(?:^|[\s,{(])initiation\s*\??\s*[:,}]/.test(literal.text)) continue;
      found.push({
        file,
        line: source.slice(0, at).split("\n").length,
      });
    }
  }
  return found;
}

function report(found) {
  for (const finding of found) {
    const rel = path.relative(REPO_ROOT, finding.file) || finding.file;
    console.error(
      `${rel}:${finding.line}: a first-party run-door body stamps source_app but no ` +
        `initiation — the server can only class this run 'api'. Add ` +
        `initiation: "user" (a person's gesture) or "auto" (client code).`,
    );
  }
}

function selfTest() {
  const planted = `
    const body = {
      source_app: "workflow-studio",
      source_feature: "conductor",
      conversation_id: id,
      is_new: true,
      user_input: text,
    };
  `;
  const honest = planted.replace("source_feature:", 'initiation: "user",\n      source_feature:');
  const readPlanted = (f) => (f === "planted.ts" ? planted : honest);
  const red = findings(["planted.ts"], readPlanted);
  const green = findings(["honest.ts"], readPlanted);
  if (red.length !== 1) {
    console.error("SELF-TEST FAILED: the guard did not flag a run door missing initiation.");
    process.exit(1);
  }
  if (green.length !== 0) {
    console.error("SELF-TEST FAILED: the guard flagged a run door that declares initiation.");
    process.exit(1);
  }
  console.log("check_client_initiation self-test: RED on the missing attestation, GREEN once declared.");
  process.exit(0);
}

function main() {
  if (process.argv.includes("--self-test")) selfTest();
  const files = [];
  for (const root of SCAN_ROOTS) walk(path.join(REPO_ROOT, root), files);
  const found = findings(files);
  if (found.length > 0) {
    report(found);
    console.error(
      `\n${found.length} first-party run door(s) do not declare initiation. ` +
        "Law: common-docs/systems/platform/provenance/FEATURE.md.",
    );
    process.exit(1);
  }
  console.log(`check_client_initiation: ${files.length} client files, every run door attested.`);
}

main();
