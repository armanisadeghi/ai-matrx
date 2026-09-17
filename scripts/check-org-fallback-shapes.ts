#!/usr/bin/env npx tsx
/**
 * check-org-fallback-shapes — the organization a write acts in is the one the
 * user SELECTED. Nothing substitutes it.
 *
 * THE LAW: common-docs/policies/context-is-carried-never-rebuilt.md — "Nothing
 * below the boundary invents, defaults, or substitutes it. No
 * personal-organization fallback, no system-organization fallback, no database
 * trigger choosing a tenant." Redux `appContext.organization_id` is the
 * selection, settled once at bootstrap by `lib/organizations/resolveActiveOrgContext.ts`
 * — and boot is TOTAL (rung b explicitly SELECTS the user's own personal
 * workspace when nothing else applies), so an empty selection means genuinely
 * unresolved, never "we could have used their personal workspace".
 *
 * THE CLASS this guards: the shapes that made a write land in a workspace the
 * person never chose, silently — `organization_id ?? personal_organization_id`
 * in a selector, `orgId ?? personalOrgId` at a write site, an `.eq()` filtered
 * by a substituted organization. They do not throw, they do not log; the row
 * simply goes to the wrong tenant and the person cannot find their own work.
 * The primitives were made strict on 2026-09-17 (`getActiveOrgId` reads the
 * selection only; `ensureOrgId` throws `OrganizationContextError`); this sweep
 * stops the shape growing back at any call site.
 *
 * WHAT IT FAILS ON (TypeScript AST, never a regex over the text)
 *   1. Any reference to `selectEffectiveOrganizationId` — the deleted selector
 *      (`organization_id ?? personal_organization_id`).
 *   2. A `??` or `||` whose RIGHT operand is a personal/system organization —
 *      `personal_organization_id`, `personalOrgId`, `peekPersonalOrgId()`,
 *      `resolvePersonalOrgId()`, `SYSTEM_ORGANIZATION_ID` (property access and
 *      `await` included) — when the result FEEDS an organization: an
 *      `organization_id` / `organizationId` property, a variable or assignment
 *      whose name ends in `organizationId` / `orgId`.
 *   3. `.eq("organization_id", x ?? <one of those>)` — the read half of the
 *      same mistake.
 *
 * THE ONE EXEMPTION, and it is never silent: a line that deliberately reads the
 * person's OWN workspace by name (a creator's payout account; the personal
 * organization as the STORAGE of a cross-organization default) carries
 *
 *     // org-fallback-deliberate: <reason, at least 10 characters>
 *
 * on the offending line or the line above it. Grep that marker to census every
 * deliberate personal-organization read in the repo.
 *
 * WHAT IT CANNOT SEE (never let a green run imply more than it proves)
 *   • A substitution assembled elsewhere and passed in as a plain argument.
 *   • An `if (!orgId) orgId = await resolvePersonalOrgId();` written as a
 *     statement rather than a fallback expression.
 *   • Whether a deliberate marker's reason is TRUE — only that it exists.
 *
 * Usage:
 *   tsx scripts/check-org-fallback-shapes.ts              # exit 1 on a violation
 *   tsx scripts/check-org-fallback-shapes.ts --self-test  # prove it can fail
 * It is the FIRST step of `pnpm check:organization-context`, which CI runs on
 * every PR (.github/workflows/ci.yml calls that alias, not the script list).
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");

const SCAN_DIRS = ["app", "components", "features", "hooks", "lib", "utils"];

/** The deleted selector. Any reference at all is a violation. */
const DELETED_SELECTOR = "selectEffectiveOrganizationId";

/** Identifier / property names that mean "this user's own or the system org". */
const SUBSTITUTE_NAMES = new Set([
  "personal_organization_id",
  "personalOrgId",
  "personalOrganizationId",
  "SYSTEM_ORGANIZATION_ID",
]);

/** Calls that RESOLVE one of those organizations. */
const SUBSTITUTE_CALLS = new Set([
  "peekPersonalOrgId",
  "resolvePersonalOrgId",
  "resolveSystemOrgId",
]);

const DELIBERATE_MARKER = "org-fallback-deliberate:";

export interface Finding {
  file: string;
  line: number;
  kind: "deleted-selector" | "fallback" | "eq-filter";
  snippet: string;
}

/** `organizationId`, `organization_id`, `scopeOrganizationId`, `orgId`, … */
function isOrganizationTargetName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/_/g, "");
  return normalized.endsWith("organizationid") || normalized.endsWith("orgid");
}

/** Strip `await`, parentheses and non-null assertions down to the real node. */
function unwrap(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) current = current.expression;
    else if (ts.isAwaitExpression(current)) current = current.expression;
    else if (ts.isNonNullExpression(current)) current = current.expression;
    else if (ts.isAsExpression(current)) current = current.expression;
    else return current;
  }
}

/** True when `expr` names the personal or the system organization. */
function isSubstituteOrganization(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) return SUBSTITUTE_NAMES.has(node.text);
  if (ts.isPropertyAccessExpression(node)) {
    return SUBSTITUTE_NAMES.has(node.name.text);
  }
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : "";
    return SUBSTITUTE_CALLS.has(name);
  }
  return false;
}

/** A `??` / `||` whose right operand substitutes the organization. */
function isSubstitutingFallback(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (!ts.isBinaryExpression(node)) return false;
  const op = node.operatorToken.kind;
  if (
    op !== ts.SyntaxKind.QuestionQuestionToken &&
    op !== ts.SyntaxKind.BarBarToken
  ) {
    return false;
  }
  return isSubstituteOrganization(node.right);
}

/** Does this expression CONTAIN a substituting fallback anywhere inside it? */
function containsSubstitutingFallback(expr: ts.Expression): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isBinaryExpression(node) && isSubstitutingFallback(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expr);
  return found;
}

/**
 * A deliberate marker on the offending line or the line above it exempts it.
 * The reason must be real (>= 10 characters) — an unexplained marker exempts
 * nothing, exactly like the sibling guards' allowlist reasons.
 */
function isDeliberate(lines: string[], lineIndex: number): boolean {
  for (const i of [lineIndex, lineIndex - 1, lineIndex - 2]) {
    const text = lines[i];
    if (!text) continue;
    const at = text.indexOf(DELIBERATE_MARKER);
    if (at === -1) continue;
    const reason = text.slice(at + DELIBERATE_MARKER.length).trim();
    if (reason.length >= 10) return true;
  }
  return false;
}

export function scanSource(relPath: string, source: string): Finding[] {
  const sf = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = source.split("\n");
  const findings: Finding[] = [];

  const record = (
    node: ts.Node,
    kind: Finding["kind"],
  ): void => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    if (isDeliberate(lines, line)) return;
    findings.push({
      file: relPath,
      line: line + 1,
      kind,
      snippet: node.getText(sf).replace(/\s+/g, " ").slice(0, 160),
    });
  };

  const visit = (node: ts.Node): void => {
    // 1. The deleted selector, in any position.
    if (ts.isIdentifier(node) && node.text === DELETED_SELECTOR) {
      record(node, "deleted-selector");
    }

    // 2a. `{ organization_id: x ?? personalOrgId }`
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      isOrganizationTargetName(node.name.text) &&
      isSubstitutingFallback(node.initializer)
    ) {
      record(node, "fallback");
    }

    // 2b. `const organizationId = x ?? personalOrgId`
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isOrganizationTargetName(node.name.text) &&
      node.initializer &&
      isSubstitutingFallback(node.initializer)
    ) {
      record(node, "fallback");
    }

    // 2c. `organizationId = x ?? personalOrgId` / `row.organization_id = …`
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isSubstitutingFallback(node.right)
    ) {
      const target = unwrap(node.left);
      const name = ts.isIdentifier(target)
        ? target.text
        : ts.isPropertyAccessExpression(target)
          ? target.name.text
          : "";
      if (name && isOrganizationTargetName(name)) record(node, "fallback");
    }

    // 3. `.eq("organization_id", x ?? personalOrgId)`
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "eq" &&
      node.arguments.length >= 2
    ) {
      const column = node.arguments[0];
      if (
        (ts.isStringLiteral(column) ||
          ts.isNoSubstitutionTemplateLiteral(column)) &&
        isOrganizationTargetName(column.text) &&
        containsSubstitutingFallback(node.arguments[1])
      ) {
        record(node, "eq-filter");
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (
        name === "__tests__" ||
        name === "__mocks__" ||
        name === "fixtures" ||
        name === "stories"
      ) {
        continue;
      }
      yield* walk(full);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories)\.tsx?$/.test(name)
    ) {
      yield full;
    }
  }
}

/** Cheap text pre-filter — the AST pass only runs on files that could match. */
function couldMatch(source: string): boolean {
  if (source.includes(DELETED_SELECTOR)) return true;
  for (const name of SUBSTITUTE_NAMES) if (source.includes(name)) return true;
  for (const name of SUBSTITUTE_CALLS) if (source.includes(name)) return true;
  return false;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "org-fallback-selftest-"));
  try {
    const cases: Array<{ label: string; code: string }> = [
      {
        label: "the deleted selector",
        code: [
          'import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";',
          "export const orgOf = (s: never) => selectEffectiveOrganizationId(s);",
        ].join("\n"),
      },
      {
        label: "an `organization_id` property fed by the personal org",
        code: [
          "export function payload(orgId: string | null, personalOrgId: string) {",
          "  return { organization_id: orgId ?? personalOrgId };",
          "}",
        ].join("\n"),
      },
      {
        label: "an org variable fed by `peekPersonalOrgId()`",
        code: [
          'import { peekPersonalOrgId } from "@/lib/organizations/personalOrg";',
          "export function resolve(scopeOrganizationId: string | null) {",
          "  const organizationId = scopeOrganizationId || peekPersonalOrgId();",
          "  return organizationId;",
          "}",
          "",
        ].join("\n"),
      },
      {
        label: "an assignment fed by `SYSTEM_ORGANIZATION_ID`",
        code: [
          'import { SYSTEM_ORGANIZATION_ID } from "@/lib/organizations/systemOrg";',
          "export function stamp(row: { organization_id: string | null }, orgId: string | null) {",
          "  row.organization_id = orgId ?? SYSTEM_ORGANIZATION_ID;",
          "}",
        ].join("\n"),
      },
      {
        label: "an `.eq()` filtered by a substituted organization",
        code: [
          "export function read(db: any, orgId: string | null, personal_organization_id: string) {",
          '  return db.from("notes").eq("organization_id", orgId ?? personal_organization_id);',
          "}",
        ].join("\n"),
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const rel = `offender-${index}.ts`;
      const file = join(dir, rel);
      writeFileSync(file, testCase.code);
      const hits = scanSource(rel, readFileSync(file, "utf8"));
      if (hits.length < 1) {
        console.error(
          `[check:org-fallback-shapes] SELF-TEST FAILED — the guard did not flag ${testCase.label}. It can no longer fail on that shape, so a green run proves nothing.`,
        );
        return 1;
      }
    }

    // Clean code: the selected organization, and a DELIBERATE, marked read of
    // the person's own workspace. Neither may be flagged.
    const clean = [
      'import { getActiveOrgId } from "@/lib/organizations/activeOrg";',
      'import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";',
      "export async function payload(explicit: string | null) {",
      "  const organizationId = explicit ?? getActiveOrgId();",
      '  if (!organizationId) throw new Error("Select an organization before sending this request.");',
      "  return { organization_id: organizationId };",
      "}",
      "export async function ownDefault(employerOrganizationId: string | null) {",
      "  const personalOrgId = await resolvePersonalOrgId();",
      "  // org-fallback-deliberate: absent employer means the person's own cross-organization default row",
      "  return { organization_id: employerOrganizationId ?? personalOrgId };",
      "}",
    ].join("\n");
    const cleanHits = scanSource("clean.ts", clean);
    if (cleanHits.length !== 0) {
      console.error(
        `[check:org-fallback-shapes] SELF-TEST FAILED — the guard flagged compliant code (${cleanHits
          .map((h) => `${h.line}:${h.kind}`)
          .join(", ")}), which would push people off the canonical primitives.`,
      );
      return 1;
    }

    console.log(
      `[check:org-fallback-shapes] self-test OK — flags all ${cases.length} substitution shapes, passes the selected-organization path and a marked deliberate personal-organization read.`,
    );
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  if (process.argv.slice(2).includes("--self-test")) return selfTest();

  const findings: Finding[] = [];
  let scanned = 0;

  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    try {
      statSync(abs);
    } catch {
      continue;
    }
    for (const file of walk(abs)) {
      const rel = relative(ROOT, file);
      if (rel === relative(ROOT, join(ROOT, "scripts/check-org-fallback-shapes.ts"))) {
        continue;
      }
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scanned += 1;
      if (!couldMatch(source)) continue;
      findings.push(...scanSource(rel, source));
    }
  }

  if (findings.length > 0) {
    console.error(
      `\n[check:org-fallback-shapes] ${findings.length} place(s) substitute the organization the user selected:\n`,
    );
    for (const f of findings) {
      console.error(`  ✗ ${f.file}:${f.line} [${f.kind}] ${f.snippet}`);
    }
    console.error(
      "\nTHE LAW: common-docs/policies/context-is-carried-never-rebuilt.md — the organization is READ below the boundary, never invented, defaulted or substituted.\n" +
        "Fix: take the organization the user SELECTED (`selectOrganizationId` in React, `getActiveOrgId()` outside it, `ensureOrgId(explicit)` for a write) and REFUSE when there is none — `OrganizationContextError` with \"Select an organization before sending this request.\", which every surface already renders as `OrganizationRequiredNotice`.\n" +
        "If the row genuinely belongs to the person's OWN workspace, read the personal organization BY NAME and say why on the line above:\n" +
        `  // ${DELIBERATE_MARKER} <reason, at least 10 characters>\n`,
    );
    return 1;
  }

  console.log(
    `[check:org-fallback-shapes] OK — ${scanned} files scanned, 0 substituted organizations.`,
  );
  return 0;
}

try {
  exitAfterDrain(main());
} catch (err) {
  console.error("[check:org-fallback-shapes] unexpected error:", err);
  exitAfterDrain(2);
}
