#!/usr/bin/env tsx
/**
 * JSX sibling key-collision guard — catches the defect class where two
 * different components in ONE children array carry the identical `key`, so
 * React reconciles that whole sibling region by DESTROYING and recreating it.
 *
 * THE MECHANISM (live bug, 2026-09-15, the Masterwork Rulebook page): a
 * non-technical user pasting an 8,000-character transcript into the "Add rules
 * from a source" dialog watched it vanish mid-typing, with the in-flight
 * keystrokes landing in an unrelated background textarea. The page rendered
 *
 *     <TriageDraftsDialog  key={rulebook.id} ... />     // line 2464
 *     <IngestTimelineDialog key={rulebook.id} ... />    // line 2578
 *
 * as siblings in one array that also contains `cond ? <X/> : null` slots. A
 * `null` child produces no fiber, so the moment any conditional slot flips,
 * React leaves its index fast-path for `mapRemainingChildren`, keyed by
 * `fiber.key`. The duplicate key collapses in that map: one fiber overwrites
 * the other, the matching pass then sees a type mismatch for one and nothing
 * for the other, and React destroys and recreates both subtrees AND the
 * alignment of everything after them — including an open dialog. There is no
 * `onOpenChange`, no animation and no error: the dialog is simply gone, and
 * Radix's focus scope restores focus to whatever was focused behind it, which
 * is where the rest of the user's typing goes.
 *
 * React does warn ("Encountered two children with the same key"), but only in
 * the dev console, where it had been firing unread for days.
 *
 * THE RULE: within one JSX children array, no two element children may carry
 * the same `key` expression text. Namespace it — `key={`triage-${id}`}` — the
 * convention the same file already uses for its lane-keyed dialog.
 *
 * Modes:
 *   pnpm check:jsx-key-collisions             scan app/ + features/ + components/ + lib/
 *   pnpm check:jsx-key-collisions <paths...>  scan just those files or dirs
 *   pnpm check:jsx-key-collisions --self-test prove the guard can fail
 */
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");
const DEFAULT_ROOTS = ["app", "features", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git"]);

type Finding = { file: string; line: number; key: string; tags: string[] };

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
}

/** The text of a `key={...}` attribute, or null when the element has no key. */
function keyExpressionText(
  opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  source: ts.SourceFile,
): string | null {
  for (const attr of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (attr.name.getText(source) !== "key") continue;
    const init = attr.initializer;
    if (!init) return null;
    if (ts.isStringLiteral(init)) return JSON.stringify(init.text);
    if (ts.isJsxExpression(init) && init.expression) {
      return init.expression.getText(source).replace(/\s+/g, " ").trim();
    }
    return null;
  }
  return null;
}

function tagName(node: ts.JsxElement | ts.JsxSelfClosingElement, source: ts.SourceFile): string {
  return ts.isJsxElement(node)
    ? node.openingElement.tagName.getText(source)
    : node.tagName.getText(source);
}

export function findCollisions(file: string, text: string): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  const inspectChildren = (children: ts.NodeArray<ts.JsxChild>) => {
    // key expression text -> the element children carrying it
    const byKey = new Map<string, { node: ts.Node; tag: string }[]>();
    for (const child of children) {
      if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) continue;
      const opening = ts.isJsxElement(child) ? child.openingElement : child;
      const key = keyExpressionText(opening, source);
      if (key === null) continue;
      const bucket = byKey.get(key) ?? [];
      bucket.push({ node: child, tag: tagName(child, source) });
      byKey.set(key, bucket);
    }
    for (const [key, holders] of byKey) {
      if (holders.length < 2) continue;
      const line = source.getLineAndCharacterOfPosition(holders[0].node.getStart(source)).line + 1;
      findings.push({
        file: relative(ROOT, file),
        line,
        key,
        tags: holders.map((h) => h.tag),
      });
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) inspectChildren(node.children);
    else if (ts.isJsxFragment(node)) inspectChildren(node.children);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function scan(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("key=")) continue;
    try {
      findings.push(...findCollisions(file, text));
    } catch {
      // A file that does not parse is check:parse's job, not ours.
    }
  }
  return findings;
}

function selfTest(): never {
  const dir = mkdtempSync(join(tmpdir(), "jsx-key-guard-"));
  const bad = join(dir, "Bad.tsx");
  writeFileSync(
    bad,
    [
      "export function Bad({ item, open }: any) {",
      "  return (",
      "    <div>",
      "      {open ? <Slot /> : null}",
      "      <AlphaDialog key={item.id} />",
      "      <BetaDialog key={item.id} />",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n"),
  );
  const good = join(dir, "Good.tsx");
  writeFileSync(
    good,
    [
      "export function Good({ item, open }: any) {",
      "  return (",
      "    <div>",
      "      {open ? <Slot /> : null}",
      "      <AlphaDialog key={`alpha-${item.id}`} />",
      "      <BetaDialog key={`beta-${item.id}`} />",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n"),
  );
  const badFindings = scan([bad]);
  const goodFindings = scan([good]);
  rmSync(dir, { recursive: true, force: true });

  const failures: string[] = [];
  if (badFindings.length !== 1) {
    failures.push(`expected the planted collision to be caught, got ${badFindings.length} finding(s)`);
  }
  if (goodFindings.length !== 0) {
    failures.push(`expected the namespaced keys to pass, got ${goodFindings.length} finding(s)`);
  }
  if (failures.length) {
    console.error("check:jsx-key-collisions --self-test FAILED");
    for (const failure of failures) console.error(`  - ${failure}`);
    exitAfterDrain(1);
  }
  console.log(
    "check:jsx-key-collisions --self-test PASSED — the guard catches a planted sibling key collision and clears namespaced keys.",
  );
  exitAfterDrain(0);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();

  const targets = args.filter((a) => !a.startsWith("--"));
  const files: string[] = [];
  const roots = targets.length ? targets : DEFAULT_ROOTS;
  for (const entry of roots) {
    const full = resolve(ROOT, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, files);
    else if (full.endsWith(".tsx")) files.push(full);
  }

  const findings = scan(files);
  if (!findings.length) {
    console.log(`check:jsx-key-collisions OK — ${files.length} .tsx files, no sibling key collisions.`);
    return;
  }
  console.error(
    `check:jsx-key-collisions FAILED — ${findings.length} sibling key collision(s). Two children of ONE JSX array share a key, so React destroys and recreates that whole region on any sibling change; an open dialog is torn down mid-typing and the typing lands somewhere else.\n`,
  );
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  key={${f.key}}  shared by: ${f.tags.join(", ")}`);
  }
  console.error(
    "\nRemedy: namespace each key with the component it belongs to, e.g. key={`triage-${id}`} / key={`timeline-${id}`}.",
  );
  exitAfterDrain(1);
}

main();
