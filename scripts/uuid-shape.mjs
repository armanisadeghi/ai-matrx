/**
 * uuid-shape.mjs — THE SHAPE RULE for UUID validation.
 *
 * WHY (2026-09-30). `isUuidShape` and `isRfc4122Uuid` have been registered in
 * the name catalog since 2026-09-07 and both read clean, while a census the
 * same day found 109 non-test files in matrx-frontend alone still carrying
 * their own anchored UUID regex. The name lane could not see one of them: they
 * are inline regex literals (`/^[0-9a-f]{8}-…$/i.test(id)`) or local constants
 * under whatever name the author liked — `UUID`, `UUID_RE`, `UUID_TEXT`,
 * `RECORD_ID`, `ENTITY_REF_ID`, `uuidRegex`. A capability is duplicated by its
 * SHAPE long before anybody re-uses its spelling.
 *
 * THE PATTERN THIS DETECTS. A regex whose WHOLE BODY is one UUID, anchored at
 * both ends — the only reason to write that is to ask "is this string a UUID?":
 *   - a regex LITERAL `/^…$/flags`, wherever it sits (a const, `.test(`,
 *     `.match(`, a zod `.regex(`, a type guard);
 *   - a `new RegExp("^…$", flags)` string, a `new RegExp(NAME)` whose NAME is
 *     a file-level string constant, and a `new RegExp(\`^${NAME}$\`)` template
 *     whose NAME resolves the same way.
 * The UUID is recognised by STRUCTURE, not by spelling: a tiny tokenizer reads
 * the body into 36 positions, so `[0-9a-f]{8}` and eight repeated classes,
 * `(?:[0-9a-f]{4}-){3}`, `[\da-f]`, `[0-9a-fA-F]` and `[a-f0-9]`, one wrapping
 * capture group, and every version/variant spelling all land on the same shape.
 *
 * EACH FINDING NAMES ITS CONTRACT, because the fix depends on it and "strict
 * stays strict, lax stays lax" is the whole rule of the collapse:
 *   - any version, any variant, case-insensitive   → isUuidShape
 *   - version [1-5] + variant [89ab], insensitive  → isRfc4122Uuid
 *   - anything else (version [1-8], v4-only, a lower-case-only class with no
 *     `i` flag) matches NO kit export today. It is still a local copy of the
 *     capability, so it is still reported; the fix is a kit OPTION, never a
 *     local body, and until kit has it the file goes in `shapeCensus` with
 *     the missing contract named as its blocker.
 *
 * NEGATIVES, all of them live shapes in this fleet:
 *   - an EXTRACTOR: no `^…$` anchors (`/…/gi` with `matchAll` / `replace`,
 *     `\b…\b`), or a `g` / `m` flag. Finding UUIDs inside larger text is a
 *     different capability, and kit exports no extractor;
 *   - a COMPOSITE key or route anchored around a UUID — `^record:(uuid)$`,
 *     `^/crm/uuid/?$`, `^(?:slug|uuid)$`. That validates a different shape;
 *   - a SQL / Postgres pattern inside a SQL STRING (`id ~* '^…$'`). Strings are
 *     only read when they are the argument of `new RegExp(`;
 *   - TEST FIXTURES: `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`,
 *     `tests/`, `e2e/`, `fixtures/`;
 *   - a comment quoting the pattern, and a minified bundle line.
 *
 * Exported as a module so `check-package-twins.mjs` can run it as a shape lane
 * and so the self-test can plant a body and prove it fails.
 */

const MINIFIED_LINE = 500;

/** Test code is not a consumer: fixtures legitimately spell a UUID pattern. */
const TEST_PATH_RE =
  /(^|\/)(?:__tests__|__mocks__|tests?|e2e|fixtures?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function isUuidFixturePath(file) {
  return typeof file === "string" && TEST_PATH_RE.test(file);
}

const REGEX_OK_KEYWORDS = new Set([
  "return", "typeof", "case", "do", "else", "in", "of", "new", "delete",
  "void", "throw", "instanceof", "yield", "await", "export", "default",
]);

/**
 * A small JS/TS lexer: just enough to tell a REGEX LITERAL from a division,
 * a string, a template and a comment. Returns tokens
 *   { t: "regex", body, flags, line } | { t: "string", value, line }
 *   { t: "template", parts: [string | {expr}], line } | { t: "ident", v, line }
 *   { t: "punct", v, line }
 */
function lex(source) {
  const toks = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  let prev = null; // last significant token
  const push = (tok) => {
    toks.push(tok);
    prev = tok;
  };
  const regexAllowed = () => {
    if (!prev) return true;
    if (prev.t === "ident") return REGEX_OK_KEYWORDS.has(prev.v);
    if (prev.t === "num" || prev.t === "string" || prev.t === "template" || prev.t === "regex") return false;
    if (prev.t === "punct") return !(prev.v === ")" || prev.v === "]" || prev.v === "}");
    return true;
  };
  while (i < n) {
    const c = source[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    // comments
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // strings — never across a newline, so a stray JSX apostrophe cannot
    // swallow the rest of the file
    if (c === '"' || c === "'") {
      const start = line;
      let j = i + 1;
      let value = "";
      while (j < n && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\" && j + 1 < n) {
          const e = source[j + 1];
          value += e === "\\" || e === "/" || e === '"' || e === "'" ? e : "\\" + e;
          j += 2;
          continue;
        }
        value += source[j];
        j++;
      }
      push({ t: "string", value, line: start });
      i = source[j] === c ? j + 1 : j;
      continue;
    }
    // templates, with `${…}` interpolations kept as their raw expression text
    if (c === "`") {
      const start = line;
      const parts = [];
      let text = "";
      let j = i + 1;
      while (j < n && source[j] !== "`") {
        if (source[j] === "\\" && j + 1 < n) {
          const e = source[j + 1];
          text += e === "\\" || e === "`" || e === "$" ? e : "\\" + e;
          j += 2;
          continue;
        }
        if (source[j] === "$" && source[j + 1] === "{") {
          parts.push(text);
          text = "";
          let depth = 1;
          let k = j + 2;
          let expr = "";
          while (k < n && depth > 0) {
            if (source[k] === "{") depth++;
            else if (source[k] === "}") depth--;
            if (source[k] === "\n") line++;
            if (depth > 0) expr += source[k];
            k++;
          }
          parts.push({ expr: expr.trim() });
          j = k;
          continue;
        }
        if (source[j] === "\n") line++;
        text += source[j];
        j++;
      }
      parts.push(text);
      push({ t: "template", parts, line: start });
      i = j + 1;
      continue;
    }
    // regex literal
    if (c === "/" && source[i - 1] !== "<" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n && source[j] !== "\n") {
        const d = source[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) {
          ok = true;
          break;
        }
        j++;
      }
      if (ok) {
        const body = source.slice(i + 1, j);
        let k = j + 1;
        while (k < n && /[a-z]/.test(source[k])) k++;
        push({ t: "regex", body, flags: source.slice(j + 1, k), line });
        i = k;
        continue;
      }
      push({ t: "punct", v: "/", line });
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(source[j])) j++;
      push({ t: "ident", v: source.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(source[j])) j++;
      push({ t: "num", line });
      i = j;
      continue;
    }
    push({ t: "punct", v: c, line });
    i++;
  }
  return toks;
}

/** Split `a|b` at the TOP level of a regex body (outside groups and classes). */
function hasTopLevelAlternation(body) {
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "|" && depth === 0) return true;
  }
  return false;
}

/**
 * Read a regex body into its positions. Each unit is
 *   { k: "H", lower, upper } — a hex class
 *   { k: "V", lo, hi }       — a version-nibble digit range, `[1-5]`
 *   { k: "W", lower, upper } — a variant class, `[89ab]`
 *   { k: "D", d }            — a literal digit, the `4` of a v4-only pattern
 *   { k: "-" }
 * Returns null the moment anything else appears.
 */
function units(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    let group = null;
    if (c === "[") {
      const end = body.indexOf("]", i + 1);
      if (end < 0) return null;
      const cls = body.slice(i + 1, end);
      i = end + 1;
      let rest = cls;
      let lower = false;
      let upper = false;
      let digits = false;
      rest = rest.replace(/0-9|\\d/g, () => ((digits = true), ""));
      rest = rest.replace(/a-f/g, () => ((lower = true), ""));
      rest = rest.replace(/A-F/g, () => ((upper = true), ""));
      if (rest === "" && digits && (lower || upper)) {
        group = [{ k: "H", lower, upper }];
      } else if (/^[1-9]-[1-9]$/.test(cls)) {
        group = [{ k: "V", lo: Number(cls[0]), hi: Number(cls[2]) }];
      } else if (/^[89abAB]+$/.test(cls) && /[89]/.test(cls)) {
        group = [{ k: "W", lower: /[ab]/.test(cls), upper: /[AB]/.test(cls) }];
      } else {
        return null;
      }
    } else if (c === "(") {
      let depth = 1;
      let j = i + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === "\\") {
          j += 2;
          continue;
        }
        if (body[j] === "(") depth++;
        else if (body[j] === ")") depth--;
        j++;
      }
      if (depth !== 0) return null;
      let inner = body.slice(i + 1, j - 1);
      if (inner.startsWith("?:")) inner = inner.slice(2);
      else if (inner.startsWith("?")) return null;
      if (hasTopLevelAlternation(inner)) return null;
      group = units(inner);
      if (group === null) return null;
      i = j;
    } else if (c === "-") {
      group = [{ k: "-" }];
      i++;
    } else if (/[0-9]/.test(c)) {
      group = [{ k: "D", d: Number(c) }];
      i++;
    } else {
      return null;
    }
    const q = /^\{(\d+)\}/.exec(body.slice(i));
    let times = 1;
    if (q) {
      times = Number(q[1]);
      i += q[0].length;
    } else if (/^[*+?]/.test(body.slice(i))) {
      return null;
    }
    for (let t = 0; t < times; t++) out.push(...group);
  }
  return out;
}

const HYPHENS = new Set([8, 13, 18, 23]);

/**
 * THE CLASSIFIER. `null` when the pattern is not a whole-string UUID
 * validation; otherwise `{ contract, caseInsensitive, kit }` where `kit` is the
 * export that carries exactly this contract, or `null` when none does.
 */
export function classifyUuidPattern(body, flags = "") {
  if (typeof body !== "string") return null;
  if (/[gm]/.test(flags)) return null;
  if (!body.startsWith("^") || !body.endsWith("$") || body.endsWith("\\$")) return null;
  const inner = body.slice(1, -1);
  if (hasTopLevelAlternation(inner)) return null;
  const u = units(inner);
  if (u === null || u.length !== 36) return null;
  let lower = false;
  let upper = false;
  for (let p = 0; p < 36; p++) {
    const unit = u[p];
    if (HYPHENS.has(p)) {
      if (unit.k !== "-") return null;
      continue;
    }
    if (p === 14 && (unit.k === "V" || unit.k === "D")) continue;
    if (p === 19 && unit.k === "W") {
      lower ||= unit.lower;
      upper ||= unit.upper;
      continue;
    }
    if (unit.k !== "H") return null;
    lower ||= unit.lower;
    upper ||= unit.upper;
  }
  const version = u[14];
  const variant = u[19];
  let contract;
  if (version.k === "H" && variant.k === "H") contract = "any version";
  else if (version.k === "V" && variant.k === "W") contract = `version [${version.lo}-${version.hi}] + variant`;
  else if (version.k === "D" && variant.k === "W") contract = `version ${version.d} only + variant`;
  else contract = "irregular version/variant";
  const caseInsensitive = flags.includes("i") || (lower && upper);
  const casing = caseInsensitive ? "case-insensitive" : lower ? "LOWER-case only" : "UPPER-case only";
  let kit = null;
  if (caseInsensitive && contract === "any version") kit = "isUuidShape";
  if (caseInsensitive && contract === "version [1-5] + variant") kit = "isRfc4122Uuid";
  return { contract, casing, caseInsensitive, kit };
}

function describe(verdict) {
  return verdict.kit
    ? `← ${verdict.contract}, ${verdict.casing} → ${verdict.kit}`
    : `← ${verdict.contract}, ${verdict.casing} → NO kit export carries this contract (a kit option, never a local copy)`;
}

/** A string constant's value at file level: `const NAME = "…"` (or a template with no `${`). */
function stringConstants(toks) {
  const out = new Map();
  for (let i = 0; i + 3 < toks.length; i++) {
    const a = toks[i];
    if (a.t !== "ident" || !(a.v === "const" || a.v === "let" || a.v === "var")) continue;
    const name = toks[i + 1];
    if (name?.t !== "ident") continue;
    let j = i + 2;
    if (toks[j]?.t === "punct" && toks[j].v === ":") {
      while (j < toks.length && !(toks[j].t === "punct" && toks[j].v === "=")) j++;
    }
    if (!(toks[j]?.t === "punct" && toks[j].v === "=")) continue;
    const val = toks[j + 1];
    if (val?.t === "string") out.set(name.v, val.value);
    else if (val?.t === "template" && val.parts.length === 1) out.set(name.v, val.parts[0]);
  }
  return out;
}

function templateText(tok, consts) {
  let s = "";
  for (const p of tok.parts) {
    if (typeof p === "string") s += p;
    else if (/^[A-Za-z_$][\w$]*$/.test(p.expr) && consts.has(p.expr)) s += consts.get(p.expr);
    else return null;
  }
  return s;
}

/**
 * UUID-validation findings in one file's source. `file` (optional) lets the
 * lane skip test fixtures. Returns [{ line, text, kit }].
 */
export function uuidShapeIn(source, file) {
  if (isUuidFixturePath(file)) return [];
  const lines = source.split("\n");
  const toks = lex(source);
  const consts = stringConstants(toks);
  const out = [];
  const seen = new Set();
  const report = (line, verdict) => {
    if (!verdict || seen.has(line)) return;
    const text = lines[line - 1] ?? "";
    if (text.length > MINIFIED_LINE) return;
    seen.add(line);
    out.push({ line, text: `${text.trim()}   ${describe(verdict)}`, kit: verdict.kit });
  };
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (tok.t === "regex") {
      report(tok.line, classifyUuidPattern(tok.body, tok.flags));
      continue;
    }
    // new RegExp(<string | NAME | template>, <flags>?)
    if (
      tok.t === "ident" &&
      tok.v === "new" &&
      toks[i + 1]?.t === "ident" &&
      toks[i + 1].v === "RegExp" &&
      toks[i + 2]?.t === "punct" &&
      toks[i + 2].v === "("
    ) {
      const arg = toks[i + 3];
      let body = null;
      if (arg?.t === "string") body = arg.value;
      else if (arg?.t === "template") body = templateText(arg, consts);
      else if (arg?.t === "ident" && consts.has(arg.v)) body = consts.get(arg.v);
      if (body === null || body === undefined) continue;
      let flags = "";
      if (toks[i + 4]?.t === "punct" && toks[i + 4].v === ",") {
        const f = toks[i + 5];
        if (f?.t === "string") flags = f.value;
        else if (f?.t === "template" && f.parts.length === 1) flags = f.parts[0];
      }
      report(tok.line, classifyUuidPattern(body, flags));
    }
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

/**
 * THE LIVE POSITIVES, exported so `check-package-twins.mjs` can run each one
 * through every OTHER lane and prove none of them catches it (the cross-lane
 * matrix): a body reported by two lanes lands in two register rows.
 */
export const UUID_SHAPE_POSITIVES = [
  // byte-for-byte matrx-frontend lib/deep-link/resolveId.ts
  "const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nexport const isId = (s: string) => UUID.test(s);",
  // an inline literal after a KEYWORD and after `!` — matrx-frontend
  // app/(core)/podcast/[slug]/page.tsx and lib/services/agent-feedback.service.ts
  "function isId(str: string) {\n  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(\n    str,\n  );\n}\nif (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error(\"bad id\");",
  "const DOOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;",
  'const RE = new RegExp("^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$", "i");',
  "const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);",
];

/** Proves the rule can fail and does not fire on the shapes that are not UUID validation. */
export function selfTestUuidShape() {
  const hitsOf = (src, file) => uuidShapeIn(src, file ?? "src/planted.ts");

  // ── LEG 1: the live named constant + `.test(` — the commonest spelling.
  const named = hitsOf(UUID_SHAPE_POSITIVES[0]);
  if (named.length !== 1 || named[0].kit !== "isUuidShape") {
    return {
      ok: false,
      why: "a file-level `const UUID = /^[0-9a-f]{8}-…$/i` was NOT reported as an isUuidShape copy — this is the spelling ~80 matrx-frontend files carry under arbitrary names",
    };
  }

  // ── LEG 2: the INLINE literal with no name at all.
  const inline = hitsOf(UUID_SHAPE_POSITIVES[1]);
  if (inline.length !== 2) {
    return {
      ok: false,
      why: `an INLINE \`/^…$/i.test(…)\` with no binding name — after \`return\` and after \`!\` — was NOT reported on both sites (${inline.length}/2); the name lane is blind to it by construction, and this lane exists for exactly that`,
    };
  }

  // ── LEG 3: STRICT stays strict. The RFC-4122 form must map to isRfc4122Uuid.
  const strict = hitsOf(UUID_SHAPE_POSITIVES[2]);
  if (strict.length !== 1 || strict[0].kit !== "isRfc4122Uuid") {
    return {
      ok: false,
      why: `the STRICT RFC-4122 pattern (version [1-5], variant [89ab]) was not reported as an isRfc4122Uuid copy (got ${JSON.stringify(strict.map((h) => h.kit))}) — collapsing it onto the lax predicate would silently widen a validation door`,
    };
  }

  // ── LEG 4: a CONTRACT NO KIT EXPORT CARRIES is still a finding, named as such.
  const orphan = [
    "const V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;",
    UUID_SHAPE_POSITIVES[4],
  ].join("\n");
  const orphanHits = hitsOf(orphan);
  if (orphanHits.length !== 2 || orphanHits.some((h) => h.kit !== null)) {
    return {
      ok: false,
      why: `a UUID pattern whose contract NO kit export carries (version [1-8]; a lower-case-only class with no \`i\`) was either missed or mapped onto a kit predicate it does not match (got ${JSON.stringify(orphanHits.map((h) => h.kit))}) — strict stays strict and lax stays lax, and a missing contract is a kit option, never silence`,
    };
  }

  // ── LEG 5: other SPELLINGS of the same shape — `(?:…{4}-){3}`, `[\da-f]`,
  // `[0-9a-fA-F]` without `i`, eight repeated classes, a capture group.
  const spellings = [
    "const A = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;",
    "const B = /^[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}$/i;",
    "const C = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;",
    "const D = /^[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;",
    "const E = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;",
  ].join("\n");
  const spellingHits = hitsOf(spellings);
  if (spellingHits.length !== 5 || spellingHits.some((h) => h.kit !== "isUuidShape")) {
    return {
      ok: false,
      why: `an alternative SPELLING of the lax UUID shape was missed or misclassified (${spellingHits.length}/5 reported as isUuidShape) — the rule must read STRUCTURE, not one spelling`,
    };
  }

  // ── NEGATIVES ────────────────────────────────────────────────────────────
  // EXTRACTORS: no anchors, a `g`/`m` flag, `\b` boundaries.
  const extractors = [
    "const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;",
    "for (const m of text.matchAll(UUID)) ids.push(m[0]);",
    "const clean = s.replace(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b/gi, '<id>');",
    "const hasId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text);",
    "const lines = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/gm;",
    'const PART = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";',
    "const ROUTE = new RegExp(`/files/(${PART})/download`, 'i');",
  ].join("\n");
  const extractorHits = hitsOf(extractors);
  if (extractorHits.length !== 0) {
    return {
      ok: false,
      why: `an EXTRACTOR (no ^…$ anchors, or a g/m flag) was reported as a validation copy (${extractorHits.map((h) => h.text).join(" | ")}) — finding UUIDs in larger text is a different capability and kit exports no extractor`,
    };
  }
  // COMPOSITES anchored AROUND a UUID validate a different shape.
  const composites = [
    "const KEY = /^record:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;",
    "if (/^\\/crm\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/?$/i.test(p)) go();",
    "const ID = /^(?:[a-z0-9_]+(?:\\.[a-z0-9_]+)+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;",
  ].join("\n");
  const compositeHits = hitsOf(composites);
  if (compositeHits.length !== 0) {
    return {
      ok: false,
      why: `a COMPOSITE key/route/alternation anchored around a UUID was reported as a UUID validation (${compositeHits.map((h) => h.text).join(" | ")})`,
    };
  }
  // SQL / Postgres patterns inside SQL STRINGS.
  const sql = [
    "const q = sql`SELECT id FROM t WHERE id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;",
    "const w = \"WHERE ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'\";",
    // a Postgres pattern handed to SQL as a bound PARAMETER is still SQL's
    'await db.query("SELECT id FROM t WHERE id::text ~* $1", ["^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"]);',
  ].join("\n");
  const sqlHits = hitsOf(sql);
  if (sqlHits.length !== 0) {
    return {
      ok: false,
      why: `a Postgres pattern inside a SQL STRING was reported (${sqlHits.map((h) => h.text).join(" | ")}) — only a string handed to \`new RegExp(\` is a JavaScript validation`,
    };
  }
  // TEST FIXTURES are not consumers.
  for (const path of ["features/x/__tests__/a.test.ts", "src/a.spec.tsx", "tests/browser/run.cjs", "e2e/flow.ts"]) {
    if (uuidShapeIn(UUID_SHAPE_POSITIVES[0], path).length !== 0) {
      return {
        ok: false,
        why: `a TEST FIXTURE path (${path}) was reported — fixtures legitimately spell a UUID pattern`,
      };
    }
  }
  // COMMENTS, a DIVISION that looks like a regex start, and an ADOPTED call.
  const quiet = [
    "// const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;",
    "/** Was `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. */",
    'import { isUuidShape } from "@ai-matrx/kit/uuid";',
    "const half = total / 2; const r = a / b;",
    "if (!isUuidShape(id)) return null;",
    "const el = <a href={url}>and/or</a>;",
    // the other lanes' live bodies (byte / duration / money / relative-time /
    // count): the cross-lane matrix, this direction. The other direction runs
    // in check-package-twins.mjs over UUID_SHAPE_POSITIVES.
    "const kb = `${(bytes / 1024).toFixed(1)} KB`;",
    "const s = `${(ms / 1000).toFixed(1)}s`;",
    'const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });',
    "const shown = `${Math.floor((Date.now() - t) / 60000)}m ago`;",
    'const COUNT = new Intl.NumberFormat("en-US");',
  ].join("\n");
  const quietHits = hitsOf(quiet);
  if (quietHits.length !== 0) {
    return {
      ok: false,
      why: `a comment, a division, an adopted isUuidShape call or another lane's body was reported (${quietHits.map((h) => h.text).join(" | ")})`,
    };
  }
  // ── LEG 6 (run LAST, so a mutation that over-reads strings goes red on the
  // SQL leg above with its own message): the `new RegExp(…)` STRING forms —
  // literal, named constant, template.
  const strings = [
    UUID_SHAPE_POSITIVES[3],
    'const BODY = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";',
    "const R2 = new RegExp(BODY, 'i');",
    'const PART = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";',
    "const R3 = new RegExp(`^${PART}$`, \"i\");",
  ].join("\n");
  const stringHits = hitsOf(strings);
  if (stringHits.length !== 3) {
    return {
      ok: false,
      why: `a \`new RegExp(…)\` UUID validation built from a STRING was missed (${stringHits.length}/3: literal, named constant, \`^\${PART}$\` template) — the same capability spelled as a string is the same copy`,
    };
  }

  return { ok: true };
}
