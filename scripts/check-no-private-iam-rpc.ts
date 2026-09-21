/**
 * The two-argument IAM primitive answers whether ANY named person belongs to
 * ANY named organization. It is deliberately not a web-callable RPC: exposing
 * it creates a membership oracle, while calling it from a service-role client
 * bypasses the caller-bound authorization path. It is only for database
 * definer chains and trusted direct database workers.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const SCAN_DIRS = [
  "actions",
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "providers",
  "utils",
];
const SKIP_DIRS = new Set([
  "node_modules",
  "__tests__",
  "__mocks__",
  "fixtures",
  "stories",
  "test",
  "tests",
]);

export interface PrivateIamRpcFinding {
  line: number;
  reason: string;
}

function isRpcCall(node: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "rpc";
}

export function findPrivateIamRpc(source: ts.SourceFile): PrivateIamRpcFinding[] {
  const findings: PrivateIamRpcFinding[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      isRpcCall(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "has_org_access_for"
    ) {
      findings.push({
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        reason: "private IAM RPC has_org_access_for",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/**
 * `submitFeedback` is the person-originated entry point. Keep a direct census
 * of its body: the existing admin helper returns a destructured service
 * client, which is intentionally harder to follow than a direct constructor.
 */
export function findSubmitFeedbackServiceBypass(source: ts.SourceFile): PrivateIamRpcFinding[] {
  const findings: PrivateIamRpcFinding[] = [];
  const visit = (node: ts.Node, insideSubmitFeedback = false) => {
    const isSubmitFeedback =
      ts.isFunctionDeclaration(node) && node.name?.text === "submitFeedback";
    const isServiceClientCall =
      insideSubmitFeedback &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "createAdminClient" ||
        node.expression.text === "requireAdminServiceAccess");
    if (isServiceClientCall) {
      findings.push({
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        reason: "service-role client reached from person-originated submitFeedback",
      });
    }
    ts.forEachChild(node, (child) => visit(child, insideSubmitFeedback || isSubmitFeedback));
  };
  visit(source);
  return findings;
}

function filesUnder(directory: string): string[] {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : filesUnder(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function selfTest(): never | void {
  const source = ts.createSourceFile(
    "planted.ts",
    `await client.schema("iam").rpc("has_org_access_for", { p_user_id: userId, p_org: orgId });
async function submitFeedback() {
  const directAdmin = createAdminClient();
  const { admin } = await requireAdminServiceAccess();
}`,
    ts.ScriptTarget.Latest,
    true,
  );
  const findings = [
    ...findPrivateIamRpc(source),
    ...findSubmitFeedbackServiceBypass(source),
  ];
  if (
    findings.length !== 3 ||
    findings[0].line !== 1 ||
    findings[1].line !== 3 ||
    findings[2].line !== 4
  ) {
    console.error("[check:no-private-iam-rpc] SELF-TEST FAILED — planted authorization bypass was not found.");
    process.exit(1);
  }
  console.log("[check:no-private-iam-rpc] self-test passed.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const findings = SCAN_DIRS.flatMap((directory) =>
    filesUnder(join(ROOT, directory)).flatMap((filePath) => {
      const source = ts.createSourceFile(
        filePath,
        readFileSync(filePath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const privateRpcFindings = findPrivateIamRpc(source);
      const submitFeedbackBypassFindings = relative(ROOT, filePath) === "actions/feedback.actions.ts"
        ? findSubmitFeedbackServiceBypass(source)
        : [];
      return [...privateRpcFindings, ...submitFeedbackBypassFindings].map((finding) =>
        `${relative(ROOT, filePath)}:${finding.line} (${finding.reason})`,
      );
    }),
  );
  if (findings.length > 0) {
    console.error("[check:no-private-iam-rpc] Caller-bound feedback authorization was bypassed:");
    for (const finding of findings) console.error(`  ${finding}`);
    process.exit(1);
  }
  console.log("[check:no-private-iam-rpc] OK — web feedback writes preserve caller-bound authorization.");
}
