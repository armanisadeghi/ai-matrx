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
 * ## RULE 2 — a NAMED conversation door must carry the WHOLE stamp
 *
 * Rule 1 only ever fires on a literal that ALREADY stamps `source_app`. A
 * request body that stamps NOTHING AT ALL was invisible to it, which is
 * exactly how a census of 2026-09-20 found five frontend doors sending no
 * `source_app`, no `source_feature` and no `initiation` at all: the rows land
 * unattributed, cannot be costed or filtered, and `chat.conversation_lane(...)`
 * drops them into the 'matrx' lane so they surface in people's chat sidebars
 * as conversations they never started.
 *
 * So: a request descriptor that NAMES one of `CONVERSATION_DOOR_ENDPOINTS`
 * must carry `source_app` AND `initiation`. The endpoint list is explicit and
 * commented below, and so is `STAMP_BLOCKED_DOORS` — the doors whose aidream
 * request model cannot accept the stamp yet. Blocked doors are PRINTED on
 * every green run: this guard never goes quiet about a door it cannot arm.
 *
 * `--self-test` proves BOTH rules can fail: it runs the same checkers over
 * planted samples (one omitting `initiation` beside a `source_app`, one naming
 * a door endpoint with no attribution at all) and exits non-zero unless each
 * planted sample is reported and each honest sample is not.
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

/**
 * ── RULE 2's EXPLICIT ENDPOINT LIST ─────────────────────────────────────────
 *
 * Server paths that CREATE or CONTINUE a conversation row AND whose aidream
 * request model actually accepts the stamp today (it inherits
 * `ScopedRequest` — `aidream/services/conversation_context/scope.py` — which is
 * the ONLY base carrying `source_app` / `source_feature` / `initiation`).
 *
 * Adding a path here is how a new door becomes guarded. Before adding one,
 * confirm its request model inherits `ScopedRequest`; if it does not, it
 * belongs in `STAMP_BLOCKED_DOORS` below with its evidence, never here — a
 * stamp a `extra="forbid"` model rejects is a 422 on a live feature.
 */
const CONVERSATION_DOOR_ENDPOINTS = [
  // The canonical chat door (ChatRequest — carries source_app/initiation).
  "/ai/chat",
  // The Builder / manual-run door (aliased by ENDPOINTS.ai.manual, so the
  // literal only appears in dev consoles and docs).
  "/ai/manual",
  // The podcast pipeline (PodcastGenerateRequest extends ScopedRequest).
  "/podcast/generate",
  // Armed 2026-09-20, the moment aidream moved source_app / source_feature /
  // initiation onto AcceptsInjectedScope (services/conversation_context/scope.py):
  // every model below inherits it, so the stamp no longer 422s.
  "/images/generate",
  "/tools/test/execute",
  "/masterworks/ingest",
];

/**
 * 🚨 DOORS THIS GUARD CANNOT ARM YET — AND EXACTLY WHY.
 *
 * Every one of these is a person clicking a button in our own screens, and
 * every one of them creates an unattributed conversation row. They are NOT
 * checked, because the aidream request model physically refuses the stamp:
 * sending `source_app` would 422 the feature rather than attribute it. The fix
 * is in aidream (put the fields on the mixin every door inherits); the moment
 * it lands, move the path up into `CONVERSATION_DOOR_ENDPOINTS` and the door is
 * guarded. That landed on 2026-09-20 for /images/generate, /tools/test/execute
 * and the whole /masterworks/ingest-* family, and all three are armed above —
 * an exemption that no longer exempts anything is a lie this list must not
 * keep telling.
 *
 * Evidence read live on 2026-09-20 against aidream's models and this repo's
 * `types/python-generated/api-types.ts`.
 */
const STAMP_BLOCKED_DOORS = [
  [
    "/podcast/resume/{run_id}",
    "the endpoint takes NO request body at all (requestBody?: never) — it replays the stored request, which already carries the original declaration",
  ],
];

/** A window that has one of these is an actual REQUEST, not a mention. */
const REQUEST_WINDOW_MARKERS = /(?:^|[\s,{(])(?:method|body)\s*:/;


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

/**
 * `source`, with every comment blanked out but every byte position kept. Rule 2
 * matches string literals, and this repo documents its endpoints heavily in
 * prose — without this, `laneRates.ts`'s comments would read as call sites.
 */
export function blankComments(source) {
  const out = source.split("");
  let i = 0;
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < n) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const start = i;
      while (i < n && source[i] !== "\n") i += 1;
      blank(start, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, n);
      blank(start, i);
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** The call-expression argument list surrounding `index`, or null. */
function enclosingCallArgs(source, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === ")") depth += 1;
    else if (ch === "(") {
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
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(start, i + 1), start };
    }
  }
  return null;
}

/**
 * The SMALLEST enclosing window around `index` that actually looks like an
 * HTTP request (it names a `method:` or a `body:`), or null when the endpoint
 * is merely named — a constant table, a type, an equality check.
 */
function requestWindow(source, index) {
  const candidates = [
    enclosingCallArgs(source, index),
    enclosingObjectLiteral(source, index),
  ].filter((c) => c && REQUEST_WINDOW_MARKERS.test(c.text));
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.text.length <= b.text.length ? a : b));
}

const HAS_SOURCE_APP = /(?:^|[\s,{(])(?:source_app|sourceApp)\s*\??\s*[:,}]/;
const HAS_INITIATION = /(?:^|[\s,{(])initiation\s*\??\s*[:,}]/;

/**
 * A descriptor whose body is a VARIABLE (`body`, or `JSON.stringify(body)`)
 * carries its stamp where that variable is built, which is outside the request
 * window. Reading only the window called those doors unattributed while the
 * fields sat ten lines above — a false alarm that teaches people to delete the
 * guard. So when the body is an identifier, the text from its declaration down
 * to the request counts as part of the descriptor. Anything else (an inline
 * literal, a spread) is judged by the window alone, as before.
 */
const BODY_IS_IDENTIFIER =
  /(?:^|[\s,{(])body\s*:\s*(?:JSON\.stringify\(\s*)?([A-Za-z_$][\w$]*)\s*[,)\s}]/;

function bodyDeclarationText(source, window, requestIndex) {
  const named = BODY_IS_IDENTIFIER.exec(window.text);
  if (!named) return "";
  const identifier = named[1];
  if (identifier === "JSON" || identifier === "undefined") return "";
  const declaration = new RegExp(
    `(?:const|let|var)\\s+${identifier}\\s*(?::[^=]+)?=`,
  );
  const before = source.slice(0, requestIndex);
  const match = [...before.matchAll(new RegExp(declaration.source, "g"))].pop();
  if (!match) return "";
  return before.slice(match.index);
}

/**
 * RULE 2: a request descriptor that names a known conversation door must carry
 * BOTH halves of the stamp. Stamping nothing at all was invisible to rule 1.
 */
export function doorFindings(files, readFile = (f) => fs.readFileSync(f, "utf8")) {
  const found = [];
  for (const file of files) {
    const raw = readFile(file);
    if (!CONVERSATION_DOOR_ENDPOINTS.some((ep) => raw.includes(ep))) continue;
    const source = blankComments(raw);
    const seen = new Set();
    for (const endpoint of CONVERSATION_DOOR_ENDPOINTS) {
      // The path must END here: `/ai/chat` is not `/ai/chatter`.
      const pattern = new RegExp(
        `${endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=["'\`?#])`,
        "g",
      );
      for (const match of source.matchAll(pattern)) {
        const at = match.index;
        const window = requestWindow(source, at);
        if (!window || seen.has(window.start)) continue;
        seen.add(window.start);
        const text = window.text + bodyDeclarationText(source, window, at);
        if (HAS_SOURCE_APP.test(text) && HAS_INITIATION.test(text)) {
          continue;
        }
        found.push({
          file,
          line: source.slice(0, at).split("\n").length,
          endpoint,
        });
      }
    }
  }
  return found;
}

function reportDoors(found) {
  for (const finding of found) {
    const rel = path.relative(REPO_ROOT, finding.file) || finding.file;
    console.error(
      `${rel}:${finding.line}: this request opens the conversation door ` +
        `${finding.endpoint} with no attribution — the row lands unattributed ` +
        `and conversation_lane() drops it into the 'matrx' chat sidebar. Add ` +
        `source_app, source_feature (a slug already in aidream ` +
        `services/conversation_context/source_attribution.py) and ` +
        `initiation: "user" | "auto".`,
    );
  }
}

/** Never silent: say which doors this guard still cannot arm, and why. */
function reportBlockedDoors() {
  console.log(
    `check_client_initiation: ${STAMP_BLOCKED_DOORS.length} door famil(ies) ` +
      "are NOT guarded because aidream's request model cannot accept the stamp:",
  );
  for (const [endpoint, why] of STAMP_BLOCKED_DOORS) {
    console.log(`  - ${endpoint}\n      ${why}`);
  }
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

  // ── RULE 2 ───────────────────────────────────────────────────────────────
  // A door named with NO attribution at all — invisible to rule 1, which is
  // the whole reason rule 2 exists.
  const plantedDoor = `
    const run = await dispatch(
      callApi({
        path: "/podcast/generate",
        method: "POST",
        body,
        stream: true,
      }),
    );
  `;
  const honestDoor = plantedDoor.replace(
    "body,",
    'body: { ...body, source_app: "matrx-frontend", source_feature: "podcasts", initiation: "user" },',
  );
  // A door merely NAMED (a constant table, a docstring-free alias) is not a
  // request and must stay green, or the guard would fire on every registry.
  const mention = `
    export const ENDPOINTS = { ai: { manual: "/ai/manual" as const } };
    // A comment naming "/podcast/generate" with a body: here is still prose.
  `;
  const readDoor = (f) =>
    f === "planted-door.ts" ? plantedDoor : f === "honest-door.ts" ? honestDoor : mention;
  const doorRed = doorFindings(["planted-door.ts"], readDoor);
  const doorGreen = doorFindings(["honest-door.ts"], readDoor);
  const doorMention = doorFindings(["mention.ts"], readDoor);
  if (doorRed.length !== 1) {
    console.error(
      "SELF-TEST FAILED: rule 2 did not flag a conversation door with no attribution.",
    );
    process.exit(1);
  }
  if (doorGreen.length !== 0) {
    console.error("SELF-TEST FAILED: rule 2 flagged a door that carries the full stamp.");
    process.exit(1);
  }
  if (doorMention.length !== 0) {
    console.error("SELF-TEST FAILED: rule 2 flagged a mere mention of a door path.");
    process.exit(1);
  }
  // ── RULE 2, body-as-variable ─────────────────────────────────────────────
  // The stamp may live where the body is BUILT. Still red when it is absent
  // there, or the widening would have turned the rule off.
  const varBodyRed = `
    const body = { tool_name: name, arguments: args };
    await fetch(\`\${url}/tools/test/execute\`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  `;
  const varBodyGreen = varBodyRed.replace(
    "{ tool_name: name, arguments: args }",
    '{ tool_name: name, arguments: args, source_app: "matrx-frontend", source_feature: "tool-testing", initiation: "user" }',
  );
  const readVar = (f) => (f === "var-red.ts" ? varBodyRed : varBodyGreen);
  if (doorFindings(["var-red.ts"], readVar).length !== 1) {
    console.error(
      "SELF-TEST FAILED: rule 2 did not flag a door whose variable body carries no stamp.",
    );
    process.exit(1);
  }
  if (doorFindings(["var-green.ts"], readVar).length !== 0) {
    console.error(
      "SELF-TEST FAILED: rule 2 flagged a door whose stamp lives where the body is built.",
    );
    process.exit(1);
  }

  console.log("check_client_initiation self-test: RED on the missing attestation, GREEN once declared.");
  console.log(
    "check_client_initiation self-test: rule 2 RED on an unattributed conversation door, GREEN once stamped, quiet on a mention.",
  );
  process.exit(0);
}

function main() {
  if (process.argv.includes("--self-test")) selfTest();
  const files = [];
  for (const root of SCAN_ROOTS) walk(path.join(REPO_ROOT, root), files);
  const found = findings(files);
  const doors = doorFindings(files);
  if (found.length > 0 || doors.length > 0) {
    report(found);
    reportDoors(doors);
    console.error(
      `\n${found.length} first-party run door(s) do not declare initiation and ` +
        `${doors.length} named conversation door(s) send no attribution at all. ` +
        "Law: common-docs/systems/platform/provenance/FEATURE.md.",
    );
    process.exit(1);
  }
  console.log(
    `check_client_initiation: ${files.length} client files, every run door attested ` +
      `and every guarded conversation door stamped.`,
  );
  reportBlockedDoors();
}

main();
