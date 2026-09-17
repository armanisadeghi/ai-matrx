/**
 * check-org-header-lanes — static sweep for the X-Organization-Id admission
 * contract. A Bearer-authenticated call to an internal backend must carry the
 * selected organization; AuthMiddleware refuses an omitted header with
 * `organization_required`.
 *
 * The unit of inspection is one hand-written `fetch` and its enclosing
 * transport function. File-wide imports, comments, and a second compliant
 * request are not evidence that this particular wire call is compliant.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components", "features", "hooks", "lib", "utils", "scripts"];
const INTERNAL_HOSTS = ["stream.aimatrx.com"];
const BACKEND_IDENTIFIERS = new Set([
  "AIDREAM_PRODUCTION_URL", "BACKEND_URLS", "selectResolvedBaseUrl",
  "resolveServiceBaseUrl", "resolveBaseUrl", "resolveBaseUrlForPath",
  "NEXT_PUBLIC_BACKEND_URL", "NEXT_PUBLIC_EC2_SANDBOX_SERVER_URL",
]);
const COMPLIANT_CALLEES = new Set([
  "applyOrganizationContextHeader", "requireOrganizationContext",
  "organizationContextHeaders", "waitForOrganizationAdmission",
  "peekSelectedOrganizationId", "stampRunStreamOrganizationContext",
  "buildApiAuthHeaders", "getBackendProxyAuthHeaders", "buildHeaders",
  "authHeaders",
]);
const LEGACY_BEARER_TEMPLATE = /Authorization[^\n]{0,60}Bearer \$\{/;
const LEGACY_BACKEND_SIGNALS = [
  "AIDREAM_PRODUCTION_URL", "NEXT_PUBLIC_BACKEND_URL",
  "NEXT_PUBLIC_EC2_SANDBOX_SERVER_URL", "BACKEND_URLS",
  "selectResolvedBaseUrl", "resolveServiceBaseUrl", "resolveBaseUrl(",
  ".matrxserver.com",
];
const LEGACY_COMPLIANCE_SIGNALS = [
  "X-Organization-Id", "applyOrganizationContextHeader",
  "requireOrganizationContext", "organizationContextHeaders",
  "waitForOrganizationAdmission", "peekSelectedOrganizationId",
  "stampRunStreamOrganizationContext", "buildApiAuthHeaders",
  "getBackendProxyAuthHeaders", ".authHeaders", "authHeaders,", "authHeaders:",
];
const LEGACY_COMPLIANT_IMPORTS = [
  "@/lib/api/call-api", "@/lib/api/backend-client", "@/lib/api/matrx-transport",
  "@/lib/api/context-api", "@/lib/api/typed-client", "@/lib/api/hr-contract-client",
  "@/lib/api/proxy-backend-auth-headers", "@/lib/python-client", "@/hooks/useApiAuth",
  "@/features/files/media-client/client", "@/components/api-test-config/useApiTestConfig",
  "@ai-matrx/agents/matrx",
];

interface AllowlistEntry { file: string; reason: string }
export interface OrganizationHeaderFinding { line: number; reason: string }

function nodeName(node: ts.Node): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return null;
}

function isBackendIdentifier(name: string): boolean {
  return BACKEND_IDENTIFIERS.has(name)
    || /^NEXT_PUBLIC_(?:BACKEND_URL|EC2_SANDBOX_SERVER_URL)(?:_|$)/.test(name);
}

function isFetch(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fetch";
}

function functionBoundary(node: ts.Node): ts.Node {
  let current: ts.Node = node.parent;
  while (current.parent) {
    if (ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return node.getSourceFile();
}

function variableInitializer(name: string, scope: ts.Node): ts.Expression | null {
  let found: ts.Expression | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.initializer ?? null;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  if (found) return found;

  // A hand-written transport frequently shares a module-level endpoint constant
  // with its local request function. Resolve that declaration without allowing
  // unrelated imports or a sibling request to bless this fetch.
  const source = scope.getSourceFile();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration.initializer ?? null;
      }
    }
  }
  return null;
}

function fetchHeaders(call: ts.CallExpression): ts.Expression | null {
  const options = call.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return null;
  const headers = options.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && nodeName(property.name) === "headers",
  );
  return headers?.initializer ?? null;
}

function expressionHasBearer(expression: ts.Expression, scope: ts.Node, seen = new Set<string>()): boolean {
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return false;
    seen.add(expression.text);
    const initializer = variableInitializer(expression.text, scope);
    return initializer ? expressionHasBearer(initializer, scope, seen) : false;
  }
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && nodeName(node.name) === "Authorization") {
      const value = node.initializer;
      if (ts.isTemplateExpression(value) && value.head.text.includes("Bearer ")) found = true;
      if (ts.isStringLiteral(value) && value.text.startsWith("Bearer ")) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function expressionTargetsInternalHost(expression: ts.Expression, scope: ts.Node, seen = new Set<string>()): boolean {
  if (ts.isIdentifier(expression)) {
    if (isBackendIdentifier(expression.text)) return true;
    if (seen.has(expression.text)) return false;
    seen.add(expression.text);
    const initializer = variableInitializer(expression.text, scope);
    if (initializer && expressionTargetsInternalHost(initializer, scope, seen)) return true;
    // A URL object can be safely treated as the persistent-cloud-browser edge
    // only when its own boundary validates that exact object's hostname.
    let validatedHost = false;
    const validate = (node: ts.Node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === expression.text &&
        node.name.text === "hostname"
      ) {
        const parent = node.parent;
        if (ts.isBinaryExpression(parent)) {
          const other = parent.left === node ? parent.right : parent.left;
          if (ts.isStringLiteral(other) && INTERNAL_HOSTS.some((host) => other.text === host)) validatedHost = true;
        }
      }
      ts.forEachChild(node, validate);
    };
    validate(scope);
    return validatedHost;
  }
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      if (isBackendIdentifier(node.text)) {
        found = true;
      } else if (!seen.has(node.text)) {
        seen.add(node.text);
        const initializer = variableInitializer(node.text, scope);
        if (initializer && expressionTargetsInternalHost(initializer, scope, seen)) found = true;
      }
    }
    if (ts.isCallExpression(node) && isBackendIdentifier(nodeName(node.expression) ?? "")) found = true;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = node.text;
      if (value.includes(".matrxserver.com") && !value.includes("db.matrxserver.com")) found = true;
      if (INTERNAL_HOSTS.some((host) => value.includes(host))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function expressionHasOrganizationCompliance(expression: ts.Expression, scope: ts.Node, seen = new Set<string>()): boolean {
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return false;
    seen.add(expression.text);
    const initializer = variableInitializer(expression.text, scope);
    return initializer ? expressionHasOrganizationCompliance(initializer, scope, seen) : false;
  }
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && nodeName(node.name) === "X-Organization-Id") found = true;
    if (ts.isCallExpression(node) && COMPLIANT_CALLEES.has(nodeName(node.expression) ?? "")) found = true;
    if (ts.isPropertyAccessExpression(node) && node.name.text === "authHeaders") found = true;
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "headers" &&
      ts.isIdentifier(node.expression)
    ) {
      const initializer = variableInitializer(node.expression.text, scope);
      if (initializer && expressionHasOrganizationCompliance(initializer, scope, seen)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

/**
 * Preserve the prior coarse census for non-fetch/custom-request shapes. It is
 * deliberately additive: its import allowance remains for legacy callers,
 * while the AST rule above judges each direct fetch without that allowance.
 */
function legacyFileNeedsOrganizationAdmission(source: string): boolean {
  if (!LEGACY_BEARER_TEMPLATE.test(source)) return false;
  const withoutDatabaseHost = source.split("db.matrxserver.com").join("");
  if (!LEGACY_BACKEND_SIGNALS.some((signal) => withoutDatabaseHost.includes(signal))) return false;
  if (LEGACY_COMPLIANCE_SIGNALS.some((signal) => source.includes(signal))) return false;
  return !LEGACY_COMPLIANT_IMPORTS.some((transport) => source.includes(`"${transport}"`));
}

/** Analyze one source file. Exported for the guard's forcing tests. */
export function findOrganizationHeaderViolations(source: string, fileName = "source.ts"): OrganizationHeaderFinding[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: OrganizationHeaderFinding[] = [];
  const visit = (node: ts.Node) => {
    if (isFetch(node)) {
      const scope = functionBoundary(node);
      const headers = fetchHeaders(node);
      const target = node.arguments[0];
      if (
        headers && target &&
        expressionHasBearer(headers, scope) &&
        expressionTargetsInternalHost(target, scope) &&
        !expressionHasOrganizationCompliance(headers, scope)
      ) {
        findings.push({
          line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
          reason: "hand-built Bearer fetch to an internal host has no organization admission",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  // The AST path is request-specific. Keep the old file-wide detector alive
  // for transport shapes it cannot safely trace (for example XHR adapters).
  if (!findings.length && legacyFileNeedsOrganizationAdmission(source)) {
    findings.push({
      line: 1,
      reason: "legacy Bearer backend lane has no organization admission",
    });
  }
  return findings;
}

function loadAllowlist(): Map<string, string> {
  const path = join(ROOT, "scripts", "org-header-lanes.allowlist.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { entries: AllowlistEntry[] };
  const entries = new Map<string, string>();
  for (const entry of parsed.entries ?? []) {
    if (!entry.file || !entry.reason || entry.reason.trim().length < 10) {
      throw new Error(`allowlist entry for ${entry.file ?? "(missing file)"} needs a real reason`);
    }
    entries.set(entry.file, entry.reason);
  }
  return entries;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "__mocks__") yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|stories)\.tsx?$/.test(name) && name !== "check-org-header-lanes.ts") {
      yield full;
    }
  }
}

export function main(): number {
  const allowlist = loadAllowlist();
  const violations: string[] = [];
  const allowlisted: string[] = [];
  let scanned = 0;
  for (const dir of SCAN_DIRS) {
    const root = join(ROOT, dir);
    try { statSync(root); } catch { continue; }
    for (const file of walk(root)) {
      scanned += 1;
      const relativeFile = relative(ROOT, file);
      const findings = findOrganizationHeaderViolations(readFileSync(file, "utf8"), file);
      if (!findings.length) continue;
      const reason = allowlist.get(relativeFile);
      if (reason) allowlisted.push(`${relativeFile} — allowlisted: ${reason}`);
      else violations.push(...findings.map((finding) => `${relativeFile}:${finding.line}`));
    }
  }
  for (const line of allowlisted) console.log(`[check-org-header-lanes] ${line}`);
  if (violations.length) {
    console.error(`\n[check-org-header-lanes] ${violations.length} hand-built Bearer call(s) toward an internal host have no organization admission:\n`);
    for (const violation of violations) console.error(`  ✗ ${violation}`);
    console.error("\nFix: use a canonical transport, or build headers with the shared organization-context kernel. Legitimately org-less lanes require a reasoned allowlist entry.\n");
    return 1;
  }
  console.log(`[check-org-header-lanes] OK — ${scanned} files scanned, 0 org-less hand-built Bearer lanes toward internal hosts.`);
  return 0;
}

if (process.argv[1]?.endsWith("check-org-header-lanes.ts")) {
  try { exitAfterDrain(main()); }
  catch (error) { console.error("[check-org-header-lanes] unexpected error:", error); exitAfterDrain(2); }
}
