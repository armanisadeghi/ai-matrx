#!/usr/bin/env npx tsx
/**
 * check:kind-marker-law — `__kind` is PART OF THE DATA, everywhere.
 *
 * 🚨 THE RULE (Arman, 2026-08-21):
 *
 *   "The system itself is storing the data without this key and wrapper, which
 *   causes problems during rendering… we need to annihilate any part of the
 *   code that is either stripping away that key or any agent who is being
 *   instructed to exclude that key."
 *
 * THE LAW (KINDS_EVERYWHERE_PLAN §4.2): the discriminator-carrying form IS the
 * representation of a kind instance inside the platform — stored, passed and
 * rendered with its marker, exactly as `"object": "charge"` is part of every
 * Stripe payload. Reduction survives at EXACTLY these doors, and nowhere else:
 *
 *   1. THE AGENT PROMPT — what a model READS is prose, not a payload. (Server
 *      side; this repo has no prompt-serialization door.)
 *   2. EXTERNAL EGRESS — a value leaving for a FOREIGN contract, e.g. a
 *      schema_proposal applied to `agx_agent.output_schema` (a JSON Schema
 *      document, not a kind instance).
 *   3. THE INGESTION SHIM — drop the marker only where a closed pre-kinds model
 *      would fatally reject it. (Server side.)
 *
 * Two things are NOT doors, and both are blessed here explicitly because the
 * difference is the whole point:
 *
 *   • A SYMMETRIC COMPARISON that reduces BOTH sides inside a predicate and
 *     returns only a boolean (`envelopeMatchesParsedSource`). Nothing reduced
 *     ever leaves.
 *   • DISPLAY-ONLY formatting of a value into human prose, where the output is
 *     text a person reads and never re-enters the pipeline
 *     (`stripKindForDisplay` inside `formatInlineValue`, `StructuredValueView`).
 *
 * WHAT THIS FLAGS: a call to a `__kind`-removing helper, or a fresh
 * destructure/filter/delete of the marker key, in a file that is not blessed
 * below. Tests are exempt — a test that pins the law must be able to build both
 * shapes.
 *
 * HOW TO FIX A REAL ONE: don't strip. If a consumer chokes on the marker, teach
 * the consumer to accept-and-ignore it (add it to the mapped/known key set, or
 * declare it on the model) — never delete the identity to suit a reader.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = path.resolve(__dirname, "..");

/** Scanned roots — product code only. */
const SCAN_DIRS = ["features", "components", "app", "lib", "hooks", "utils", "actions"];

/** Demo routes are sample code, not the platform (same carve-out as check:hardcoded-prompts). */
const EXCLUDE = [/^app\/\(dev\)\//];

/** Helper names that REMOVE the marker. Adding one is not a fix. */
const REDUCERS = [
  "stripKindDeep",
  "stripKindRoot",
  "stripRootKind",
  "stripRootKindShape",
  "stripKindForDisplay",
  "stripKindFromJsonSchema",
];

/** file (repo-relative) → why it is allowed to reduce. */
const BLESSED: Record<string, string> = {
  "features/content-ir/kinds/schema-proposal.ts":
    "door 2 — EXTERNAL EGRESS: the proposal is applied verbatim to agx_agent.output_schema, " +
    "a JSON Schema document, so its own ROOT marker must not be written into it.",
  "features/content-ir/redux/render-block-envelope.ts":
    "not a door — a symmetric COMPARISON: envelopeMatchesParsedSource reduces both sides " +
    "inside the predicate and returns a boolean; no reduced value ever leaves.",
  "features/content-ir/kinds/kind-markdown-utils.ts":
    "not a door — DISPLAY ONLY: stripKindForDisplay formats a nested value into an inline " +
    "code span a human reads. It never feeds storage or a re-render.",
  "components/official/structured-value/StructuredValueView.tsx":
    "not a door — DISPLAY ONLY: the universal document view hides the discriminator from " +
    "the reader; the underlying value is untouched and 'Show the raw data' shows it.",
  "features/content-ir/registry/shape-doctor.ts":
    "not a door — a SCHEMA-side comparison: stripKindFromJsonSchema normalises two SCHEMA " +
    "DOCUMENTS before diffing their substance, never an instance. The recomputed gate must " +
    "stay indifferent to where the identity key travels.",
  "features/content-ir/studio/components/ShapeOwnerEditor.tsx":
    "not an instance — lists a SCHEMA's data properties for the title-key picker; the " +
    "discriminator is identity, never a title field.",
  "features/content-ir/studio/components/ShapeTestTab.tsx":
    "not storage — seeds the FIELD EDITOR, whose fields are the kind's data keys. The form " +
    "re-stamps the marker on emit (KindInputForm), so the round trip is lossless.",
  "features/content-ir/registry/kind-content-block-generator.ts":
    "not a reduction — drop-then-restamp: the root marker is removed only so withRootKind " +
    "immediately re-stamps the AUTHORITATIVE slug for the block being generated.",
  "features/content-ir/studio/instance-service.ts":
    "not a reduction — the WRITE path: withRootKindMarker drops any stale marker only to " +
    "re-stamp the row's real kind as the first key.",
  "features/workflow-runtime/workflow-document-text.ts":
    "not a door — field-count: `__kind` is identity, not content. workflowDocumentText " +
    "filters the marker only to COUNT a kindless payload's content fields and decide " +
    "whether exactly one document field exists; the reduced record never leaves — only " +
    "a plain string (or null) does.",
  "features/content-ir/react/loading/infer-loading-slug.ts":
    "not an instance — a SCHEMA field census: inferLoadingSlug skips the declared `__kind` " +
    "property when counting a kind SCHEMA's fields to pick a loading skeleton; the marker " +
    "is identity, never a shape signal, and only a slug leaves.",
  "features/agents/redux/execution-system/utils/build-tool-injection.ts":
    "not an instance — door 1 (THE AGENT PROMPT), schema side: the value contract is " +
    "described as PROSE in a tool description the model reads; the write seam accepts the " +
    "marker either way. No payload is reduced.",
};

/**
 * Structural strippers — read from the TypeScript AST, never from one line of
 * text. The line-regex version this replaced only knew the LITERAL spelling:
 * `delete values[KIND_KEY]` (the imported constant as a computed key) walked
 * straight past it into the mandate test bench, and a destructure split over
 * several lines was invisible. The AST sees one node whatever the spelling or
 * the line breaks:
 *
 *   • DESTRUCTURE-AWAY — an object BINDING pattern (`const {…} = v`, a
 *     parameter, a for-of head) that names the marker AND collects a `...rest`.
 *     The same tokens in an object LITERAL (`{ [KIND_KEY]: kind, ...value }`)
 *     are the opposite act — a STAMP — and are a different node kind, so the
 *     guard can never confuse the fix for the bug.
 *   • DELETE — `delete x[KIND_KEY]`, `delete x["__kind"]`, `delete x.__kind`,
 *     and `Reflect.deleteProperty(x, KIND_KEY | "__kind")`.
 *   • FILTER — `k !== KIND_KEY` / `KIND_KEY !== k` / `k != "__kind"`, either
 *     operand order (the old pattern only caught the constant on the right).
 *   • A call to a named reducer helper (`REDUCERS`).
 *
 * "The marker" is the `KIND_KEY` constant under any local name it was imported
 * or re-bound as (`import { KIND_KEY as K }`, `const K = KIND_KEY`), or the
 * string `"__kind"`.
 */
export interface MarkerViolation {
  line: number;
  what: string;
}

function isMarkerExpr(node: ts.Node | undefined, markerNames: ReadonlySet<string>): boolean {
  if (!node) return false;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  if (ts.isIdentifier(node)) return markerNames.has(node.text);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text === KIND_KEY;
  if (ts.isComputedPropertyName(node)) return isMarkerExpr(node.expression, markerNames);
  return false;
}

/** Local identifiers that hold the marker key in this file. */
function collectMarkerNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>(["KIND_KEY"]);
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) {
      const imported = (node.propertyName ?? node.name).text;
      if (imported === "KIND_KEY") names.add(node.name.text);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isMarkerExpr(node.initializer, names)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

const DELETE_WHAT = "deletes the `__kind` key";

/** Scan ONE file's source. Exported so the self-test drives the exact code the CLI runs. */
export function scanSource(fileName: string, source: string): MarkerViolation[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const markerNames = collectMarkerNames(sf);
  const out: MarkerViolation[] = [];
  const seenLines = new Set<number>();
  const report = (node: ts.Node, what: string): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (seenLines.has(line)) return;
    seenLines.add(line);
    out.push({ line, what });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (name && REDUCERS.includes(name)) {
        report(node, `\`${name}(…)\` — strips \`__kind\` outside a lawful door`);
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "Reflect" &&
        callee.name.text === "deleteProperty" &&
        isMarkerExpr(node.arguments[1], markerNames)
      ) {
        report(node, DELETE_WHAT);
      }
    } else if (ts.isDeleteExpression(node)) {
      let target: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(target) || ts.isNonNullExpression(target)) {
        target = target.expression;
      }
      if (
        (ts.isElementAccessExpression(target) && isMarkerExpr(target.argumentExpression, markerNames)) ||
        (ts.isPropertyAccessExpression(target) && target.name.text === KIND_KEY)
      ) {
        report(node, DELETE_WHAT);
      }
    } else if (ts.isObjectBindingPattern(node)) {
      const hasRest = node.elements.some((el) => el.dotDotDotToken);
      const namesMarker = node.elements.some((el) =>
        el.propertyName
          ? isMarkerExpr(el.propertyName, markerNames)
          : ts.isIdentifier(el.name) && el.name.text === KIND_KEY,
      );
      if (hasRest && namesMarker) report(node, "destructures the `__kind` key away");
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken) &&
      (isMarkerExpr(node.left, markerNames) || isMarkerExpr(node.right, markerNames))
    ) {
      report(node, "filters the marker key out");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function scan(): string[] {
  // `--others --exclude-standard` includes files that exist but are not yet
  // committed. Without it the guard was blind to exactly the file an agent is
  // most likely to be writing right now: a NEW module. Run it locally after
  // adding one and it reported a clean pass; CI then failed on the same file
  // the moment the branch was pushed, because a PR checkout has it committed.
  // A guard whose local answer differs from its CI answer teaches people to
  // ignore it. .gitignore is still honoured, so build output stays out.
  const files = execSync(
    `git ls-files --cached --others --exclude-standard ${SCAN_DIRS.map((d) => `'${d}'`).join(" ")} | grep -E '\\.(ts|tsx)$'`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean);

  const violations: string[] = [];

  for (const rel of files) {
    if (rel in BLESSED) continue;
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    if (/__tests__|\.test\.tsx?$|\.spec\.tsx?$|\.dev\.tsx?$/.test(rel)) continue;

    const livePath = path.join(ROOT, rel);
    const parkedPath = path.join(
      ROOT,
      rel.replace(/^app\/\(([^)]+)\)\//, "app/_$1_build_excluded/"),
    );
    if (!existsSync(livePath) && !existsSync(parkedPath)) continue;
    const sourcePath = existsSync(livePath) ? livePath : parkedPath;
    const source = readFileSync(sourcePath, "utf8");
    if (!source.includes(KIND_KEY) && !source.includes("KIND_KEY")) continue;

    for (const v of scanSource(rel, source)) {
      violations.push(`${rel}:${v.line}  ${v.what} — \`__kind\` is part of the data.`);
    }
  }
  return violations;
}

function main(): void {
  if (process.argv.includes("--list")) {
    console.log("Blessed `__kind` reduction sites — the only lawful ones:\n");
    for (const [rel, why] of Object.entries(BLESSED).sort()) {
      console.log(`  ${rel}\n    ${why}\n`);
    }
    return;
  }

  const violations = scan();
  if (violations.length === 0) {
    console.log("✅ `__kind` marker law holds — no stripping outside the lawful doors.");
    return;
  }

  console.error("\n🚨 THE `__kind` MARKER LAW IS BROKEN\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(
    "\n`__kind` is part of the data (KINDS_EVERYWHERE_PLAN §4.2). If a consumer chokes on\n" +
      "the marker, teach it to accept-and-ignore (add the key to its mapped/known set, or\n" +
      "declare it on the model) — never delete a payload's identity to suit a reader.\n" +
      "Run `pnpm check:kind-marker-law --list` for the doors that ARE lawful.\n",
  );
  exitAfterDrain(1);
}

// Imported by the jest self-test — only the CLI entry runs the repo scan.
if (require.main === module) main();
