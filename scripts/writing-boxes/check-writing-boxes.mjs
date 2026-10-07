#!/usr/bin/env node
/**
 * check:writing-boxes — EVERY BOX A PERSON WRITES IN IS ProTextarea / ProInput (Arman, 2026-10-07).
 *
 * A box a person types prose into (a description, a sentence for an agent, a note, a title, a
 * reply) carries the platform's writing features: the microphone, read-aloud and the rest of the
 * "…" actions, Clean up, and the page's bound agents. Those live in ONE pair of components —
 * `components/official/ProTextarea.tsx` and `components/official/ProInput.tsx`. A bare box drops
 * every one of them silently; the owner found the Applet builder's first field was one.
 *
 * Two items, each keyed per file (the count is the ratchet):
 *
 *   bare-textarea|<file>     a multi-line box that is not ProTextarea: a raw <textarea>, or the
 *                            Textarea from @ai-matrx/design-system(/controls) or @/components/ui/textarea.
 *   bare-text-field|<file>   a single-line TEXT box that is not ProInput: Field / Input from
 *                            @ai-matrx/design-system(/controls) or @/components/ui/input, with no
 *                            non-text `type=`, no `inputMode=`, not read-only, not monospace.
 *
 * NOT a writing box, so never reported: readOnly / font-mono boxes, typed inputs (number, email,
 * url, password, date, …), SearchField, the primitives' own homes (components/official,
 * components/ui), tests, demos and labs.
 *
 * A raw value (code, JSON, a slug, an alias, a path, an id) legitimately keeps the bare control —
 * say so with a `ui-exception: <reason>` comment on the tag or within the 3 lines above it
 * (`{/* ui-exception: a slug is a raw URL value *\/}`). That is the whole escape hatch.
 *
 * BASELINE (scripts/writing-boxes/baseline.json) ONLY SHRINKS: per key a count. A key absent from
 * the baseline, or a count above it, is NEW. `--shrink` lowers counts and drops fixed keys; it
 * never raises one. `--strict` exits 1 on a NEW item.
 *
 *   node scripts/writing-boxes/check-writing-boxes.mjs [paths…] [--strict] [--shrink] [--list]
 *   node scripts/writing-boxes/check-writing-boxes.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emitItem, endItems } from "../checks/items.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAG = "[writing-boxes]";
const BASELINE = "scripts/writing-boxes/baseline.json";

export const RULES = {
  "bare-textarea": {
    title: "bare textarea where a person writes",
    fix: "Use ProTextarea (components/official/ProTextarea.tsx) with surfaceName + getApplicationScope so the mic, read-aloud and the page's agents work. A raw value (code, JSON) keeps the bare box with `// ui-exception: <reason>`.",
  },
  "bare-text-field": {
    title: "bare text field where a person writes",
    fix: "Use ProInput (components/official/ProInput.tsx) so the mic and Clean up work. A raw value (slug, alias, path, id) keeps the bare box with `// ui-exception: <reason>`.",
  },
};

export function remedyForKey(key) {
  return RULES[String(key).split("|")[0]]?.fix ?? null;
}

const OUT_OF_SCOPE =
  /(^|\/)node_modules\/|\.(test|spec)\.tsx$|\/__tests__\/|^app\/\((dev|lab)\)\/|\/demos?\/|^scripts\/|^components\/official\/|^components\/ui\/|\.stories\.tsx$/;

const TEXTAREA_SOURCES = new Set(["@ai-matrx/design-system/controls", "@ai-matrx/design-system", "@/components/ui/textarea"]);
const FIELD_SOURCES = new Set(["@ai-matrx/design-system/controls", "@ai-matrx/design-system", "@/components/ui/input"]);
const IMPORT_RE = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/** Local names bound to the bare controls in this file. */
function bareNames(text) {
  const textarea = new Set();
  const field = new Set();
  for (const m of text.matchAll(IMPORT_RE)) {
    if (m[1]) continue;
    const src = m[3];
    for (const raw of m[2].split(",")) {
      const part = raw.trim();
      if (!part || part.startsWith("type ")) continue;
      const [imported, local = imported] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (imported === "Textarea" && TEXTAREA_SOURCES.has(src)) textarea.add(local);
      if ((imported === "Field" || imported === "Input") && FIELD_SOURCES.has(src)) field.add(local);
    }
  }
  return { textarea, field };
}

/** The opening tag's text starting at `start` (the "<"), honouring {…} and quoted attribute values. */
function tagText(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start, Math.min(text.length, start + 2000));
}

const NOT_WRITING = /\breadOnly\b|\bfont-mono\b/;
const TEXT_TYPE = /\btype\s*=\s*(?:"text"|'text'|\{\s*"text"\s*\})/;
const ANY_TYPE = /\btype\s*=/;

function excepted(lines, lineIdx, tag) {
  if (/ui-exception:/.test(tag)) return true;
  for (let i = Math.max(0, lineIdx - 3); i <= lineIdx; i++) if (/ui-exception:/.test(lines[i])) return true;
  return false;
}

/** One file's sites: [{ rule, line, what }]. */
export function scanSource(file, text) {
  if (OUT_OF_SCOPE.test(file)) return [];
  const { textarea, field } = bareNames(text);
  const names = new Map();
  names.set("textarea", "bare-textarea");
  for (const n of textarea) names.set(n, "bare-textarea");
  for (const n of field) names.set(n, "bare-text-field");
  const alt = [...names.keys()].map((n) => n.replace(/[$]/g, "\\$")).join("|");
  const re = new RegExp(`<(${alt})(?=[\\s/>])`, "g");
  const lines = text.split("\n");
  const sites = [];
  for (const m of text.matchAll(re)) {
    const rule = names.get(m[1]);
    const tag = tagText(text, m.index);
    if (NOT_WRITING.test(tag)) continue;
    if (rule === "bare-text-field" && (/\binputMode\s*=/.test(tag) || (ANY_TYPE.test(tag) && !TEXT_TYPE.test(tag)))) continue;
    const line = text.slice(0, m.index).split("\n").length;
    if (excepted(lines, line - 1, tag)) continue;
    sites.push({ rule, line, what: `<${m[1]}>` });
  }
  return sites;
}

function listFiles(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.tsx"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && !OUT_OF_SCOPE.test(f));
}

function narrowed(argv, env, root) {
  let paths = argv.filter((a) => !a.startsWith("--"));
  if (!paths.length && env.MATRX_FINDINGS_PATHS) {
    try {
      const parsed = JSON.parse(env.MATRX_FINDINGS_PATHS);
      if (Array.isArray(parsed)) paths = parsed.map(String);
    } catch {
      paths = [];
    }
  }
  if (!paths.length) return null;
  return paths.map((p) => relative(root, isAbsolute(p) ? p : resolve(process.cwd(), p)).split("\\").join("/").replace(/\/+$/, ""));
}

export function collect({ root = ROOT, paths = null } = {}) {
  let files = listFiles(root);
  if (paths) {
    const dirs = paths.filter((p) => p === "" || (existsSync(join(root, p)) && statSync(join(root, p)).isDirectory()));
    files = files.filter((f) => paths.includes(f) || dirs.some((d) => d === "" || f.startsWith(`${d}/`)));
  }
  const byKey = new Map();
  for (const file of files) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    for (const site of scanSource(file, readFileSync(abs, "utf8"))) {
      const key = `${site.rule}|${file}`;
      if (!byKey.has(key)) byKey.set(key, { key, rule: site.rule, file, sites: [] });
      byKey.get(key).sites.push(site);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function readBaseline(root) {
  const abs = join(root, BASELINE);
  if (!existsSync(abs)) return {};
  return JSON.parse(readFileSync(abs, "utf8")).counts ?? {};
}

function writeBaseline(root, counts) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    join(root, BASELINE),
    `${JSON.stringify({ note: "Shrink-only: bare writing boxes not yet on ProTextarea/ProInput. Lower a count by fixing a box; never add a key or raise a count (scripts/writing-boxes/check-writing-boxes.mjs).", counts: sorted }, null, 2)}\n`,
  );
}

export function main(argv = process.argv.slice(2), env = process.env, root = ROOT) {
  if (argv.includes("--self-test")) return selfTest();
  const paths = narrowed(argv, env, root);
  const found = collect({ root, paths });
  const baseline = readBaseline(root);
  let fresh = 0;
  const isNew = (f) => f.sites.length > (baseline[f.key] ?? 0);
  for (const f of found) {
    const n = isNew(f);
    if (n) fresh += 1;
    emitItem({
      key: f.key,
      status: n ? "new" : "known",
      ...(n ? {} : { basis: "debt" }),
      title: `${f.sites.length} × ${RULES[f.rule].title}`,
      file: f.file,
      line: f.sites[0].line,
      rule: f.rule,
    });
  }
  if (!paths) endItems();
  for (const f of found) {
    if (!isNew(f)) continue;
    const allowed = baseline[f.key] ?? 0;
    console.log(`  NEW ${f.file}: ${f.sites.length} ${RULES[f.rule].title} (baseline ${allowed})`);
    for (const s of f.sites.slice(0, 5)) console.log(`      :${s.line} ${s.what}`);
    console.log(`      fix: ${RULES[f.rule].fix}`);
  }
  if (argv.includes("--list")) for (const f of found) console.log(`  ${f.sites.length}\t${f.key}`);
  if (!paths && argv.includes("--shrink")) {
    const live = new Map(found.map((f) => [f.key, f.sites.length]));
    const kept = {};
    for (const [k, v] of Object.entries(baseline)) if (live.has(k)) kept[k] = Math.min(v, live.get(k));
    writeBaseline(root, kept);
    console.log(`${TAG} baseline shrunk ${Object.values(baseline).reduce((a, b) => a + b, 0)} → ${Object.values(kept).reduce((a, b) => a + b, 0)} box(es)`);
  }
  const boxes = (r) => found.filter((f) => f.rule === r).reduce((a, f) => a + f.sites.length, 0);
  const files = new Set(found.map((f) => f.file)).size;
  console.log(
    `${TAG} ${boxes("bare-textarea") + boxes("bare-text-field")} bare writing box(es) in ${files} file(s) (bare-textarea ${boxes("bare-textarea")}, bare-text-field ${boxes("bare-text-field")}), ${fresh} new${paths ? " (narrowed scan)" : ""}`,
  );
  return argv.includes("--strict") && fresh ? 1 : 0;
}

/** Proves each rule fires on its planted shape and stays quiet on the canonical and excepted ones. */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "writing-boxes-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    const plant = {
      // The owner's shape: the Applet builder's sentence box on the design-system Textarea.
      "features/applets-host/builder/Builder.tsx":
        'import { Button, Textarea } from "@ai-matrx/design-system/controls";\nexport function B() { return (<div><Textarea aria-label="What you want" rows={4} /><Button>Build</Button></div>); }\n',
      // A multi-line import, an alias, and a raw <textarea>.
      "features/notes/Edit.tsx":
        'import {\n  Field as TextBox,\n  Select,\n} from "@ai-matrx/design-system/controls";\nexport function E() { return (<><TextBox value="t" onChange={() => {}} /><textarea value="x" /></>); }\n',
      // Canonical, typed, read-only, monospace, excepted: all quiet.
      "features/ok/Ok.tsx":
        'import { ProTextarea } from "@/components/official/ProTextarea";\nimport { Field, Input, Textarea } from "@ai-matrx/design-system/controls";\nexport function O() { return (<>\n<ProTextarea surfaceName="matrx-user/notes" />\n<Input type="number" value={1} />\n<Field inputMode="numeric" />\n<Textarea readOnly value="log" />\n<Textarea className="font-mono" />\n{/* ui-exception: a slug is a raw URL value */}\n<Field value="my-slug" />\n</>); }\n',
      // The primitives' own home is out of scope.
      "components/official/ProTextarea.tsx": "export function ProTextarea() { return <textarea />; }\n",
    };
    for (const [name, text] of Object.entries(plant)) {
      execFileSync("mkdir", ["-p", dirname(join(dir, name))]);
      writeFileSync(join(dir, name), text);
    }
    const got = collect({ root: dir }).map((f) => `${f.key}=${f.sites.length}`);
    const want = [
      "bare-text-field|features/notes/Edit.tsx=1",
      "bare-textarea|features/applets-host/builder/Builder.tsx=1",
      "bare-textarea|features/notes/Edit.tsx=1",
    ];
    // The ratchet: a count above the baseline is NEW; at or below it is known.
    mkdirBaseline(dir, { "bare-textarea|features/applets-host/builder/Builder.tsx": 1, "bare-text-field|features/notes/Edit.tsx": 1, "bare-textarea|features/notes/Edit.tsx": 0 });
    const quiet = { log: console.log };
    console.log = () => {};
    let strict;
    try {
      strict = main(["--strict"], {}, dir);
    } finally {
      console.log = quiet.log;
    }
    const ok = JSON.stringify(got) === JSON.stringify(want) && strict === 1;
    console.log(`${TAG} self-test ${ok ? "PASS" : "FAIL"}: ${JSON.stringify(got)} strict=${strict}`);
    return ok ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mkdirBaseline(dir, counts) {
  execFileSync("mkdir", ["-p", join(dir, "scripts/writing-boxes")]);
  writeFileSync(join(dir, BASELINE), JSON.stringify({ counts }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
