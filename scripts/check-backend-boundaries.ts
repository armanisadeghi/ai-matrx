#!/usr/bin/env tsx
/**
 * Site-wide remote/backend transport boundary audit.
 *
 * Feature code may reach aidream only through the contract-bound typed client
 * or the Redux callApi transport. Plain database CRUD belongs in Supabase.
 * Every other direct aidream, Matrx-service, or third-party transport boundary
 * is reported until a human approves its exact finding id in
 * backend-boundary-approvals.json.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Finding {
  id: string;
  kind: "legacy-hook" | "raw-python-client" | "direct-transport";
  file: string;
  evidence: string;
}

interface Approval {
  id: string;
  approvedBy: string;
  reason: string;
}

const ROOT = join(import.meta.dirname, "..");
const APPROVALS_PATH = join(ROOT, "scripts", "backend-boundary-approvals.json");
const SCAN_DIRS = ["app", "components", "features", "hooks", "lib"];
const CORE_TRANSPORTS = new Set([
  "lib/api/call-api.ts",
  "lib/api/typed-client.ts",
  "lib/python-client.ts",
  "hooks/useBackendApi.ts",
]);
const NON_EXECUTABLE_EXCLUSIONS = new Set([
  // This route renders a fetch example inside a CodeBlock string; it does not
  // execute a network request itself.
  "app/(public)/developers/oauth/page.tsx",
]);

const PYTHON_CLIENT_IMPORT =
  /from\s+["']@\/lib\/python-client["']|import\(["']@\/lib\/python-client["']\)/;
const USE_BACKEND_API_IMPORT =
  /from\s+["']@\/hooks\/useBackendApi["']|import\(["']@\/hooks\/useBackendApi["']\)/;
const NETWORK_PRIMITIVE =
  /\bfetch\s*\(|\bresilientFetch\s*\(|new\s+XMLHttpRequest\s*\(|new\s+WebSocket\s*\(/;
const BACKEND_LOCATOR =
  /BACKEND_URLS|NEXT_PUBLIC_BACKEND_URL|server\.app\.matrxserver\.com|selectResolvedBaseUrl|resolveBaseUrl\s*\(|resolveBaseUrlForPath\s*\(|resolveFilesBaseUrl\s*\(|crawlerCommandUrl\s*\(|backendBase\s*\(|logApiTarget\s*\(|resolveOrchestratorByTier\s*\(|\bbackendUrl\b|\bbaseUrl\b|\bserverUrl\b/;
const STRONG_BACKEND_LOCATOR =
  /BACKEND_URLS|NEXT_PUBLIC_BACKEND_URL|server\.app\.matrxserver\.com|selectResolvedBaseUrl|resolveBaseUrl\s*\(|resolveBaseUrlForPath\s*\(|resolveFilesBaseUrl\s*\(|crawlerCommandUrl\s*\(|backendBase\s*\(|logApiTarget\s*\(|resolveOrchestratorByTier\s*\(/;
const REMOTE_URL = /(?:https?|wss?):\/\//;

const PYTHON_CLIENT_UTILITIES = new Set([
  "buildHeaders",
  "newRequestId",
  "resolveBaseUrl",
  "resolveBaseUrlForPath",
  "resolveFilesBaseUrl",
]);

function executableSource(source: string): string {
  const blank = (value: string) => value.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^\s*\/\/.*$/gm, blank);
}

function importsRawPythonVerb(source: string): boolean {
  if (/import\(["']@\/lib\/python-client["']\)/.test(source)) return true;
  const importPattern =
    /import\s+(?!type\b)([^;]*?)\s+from\s+["']@\/lib\/python-client["']/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source))) {
    const clause = match[1];
    if (/\*\s+as\s+/.test(clause)) return true;
    const braces = clause.match(/\{([\s\S]*?)\}/);
    if (!braces) return true;
    const symbols = braces[1]
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .filter((symbol) => !symbol.startsWith("type "))
      .map((symbol) => symbol.split(/\s+as\s+/)[0].trim());
    if (symbols.some((symbol) => !PYTHON_CLIENT_UTILITIES.has(symbol))) {
      return true;
    }
  }
  return false;
}

function backendTransportPositions(
  source: string,
  file: string,
  explicitApiTestTransport: boolean,
): number[] {
  const positions: number[] = [];
  const strongLocator = STRONG_BACKEND_LOCATOR.test(source);
  const serviceWorker =
    file === "features/files/cache/service-worker/src/sw.ts";
  const calls = new RegExp(NETWORK_PRIMITIVE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = calls.exec(source))) {
    const argumentTail = source.slice(match.index + match[0].length);
    if (match[0].includes("WebSocket")) {
      positions.push(match.index);
      continue;
    }
    // Same-origin Next.js routes are not direct Python calls. If such a route
    // proxies to Python, the app/api route itself is detected separately.
    if (/^\s*[`"']\/api\//.test(argumentTail)) continue;

    // A literal remote origin is always a transport boundary, whether it is
    // aidream, another Matrx service, or a third-party API. Those non-aidream
    // cases may be legitimate, but still require explicit human approval.
    if (/^\s*[`"'](?:https?|wss?):\/\//.test(argumentTail)) {
      positions.push(match.index);
      continue;
    }

    const nearby = source.slice(
      Math.max(0, match.index - 1_200),
      Math.min(source.length, match.index + 1_200),
    );
    if (
      serviceWorker ||
      explicitApiTestTransport ||
      strongLocator ||
      BACKEND_LOCATOR.test(nearby) ||
      REMOTE_URL.test(nearby)
    ) {
      positions.push(match.index);
    }
  }
  return positions;
}

function walk(dir: string, files: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, files);
    else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(name)) files.push(full);
  }
}

function firstEvidence(source: string, pattern: RegExp): string {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      return false;
    }
    return pattern.test(line);
  });
  if (index === -1) return "pattern found";
  return `${index + 1}: ${lines[index].trim().slice(0, 180)}`;
}

function evidenceAt(
  source: string,
  index: number,
): { line: number; column: number; text: string } {
  const line = source.slice(0, index).split("\n").length;
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  const column = index - lineStart + 1;
  const text =
    source.split("\n")[line - 1]?.trim().slice(0, 180) ?? "network call";
  return { line, column, text: `${line}:${column}: ${text}` };
}

function finding(
  kind: Finding["kind"],
  file: string,
  evidence: string,
): Finding {
  return { id: `${kind}:${file}`, kind, file, evidence };
}

function scan(): Finding[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);
  const findings: Finding[] = [];

  for (const filePath of files) {
    const file = relative(ROOT, filePath).replace(/\\/g, "/");
    if (CORE_TRANSPORTS.has(file) || NON_EXECUTABLE_EXCLUSIONS.has(file))
      continue;
    const source = readFileSync(filePath, "utf8");
    const code = executableSource(source);

    if (
      file !== "hooks/useBackendApi.ts" &&
      USE_BACKEND_API_IMPORT.test(code)
    ) {
      findings.push(
        finding("legacy-hook", file, firstEvidence(source, /useBackendApi/)),
      );
    }

    if (PYTHON_CLIENT_IMPORT.test(code) && importsRawPythonVerb(code)) {
      findings.push(
        finding(
          "raw-python-client",
          file,
          firstEvidence(source, /@\/lib\/python-client/),
        ),
      );
    }

    const explicitApiTestTransport =
      file.startsWith("app/(dev)/demos/api-tests/") &&
      !file.endsWith("/hooks/useSaveSample.ts") &&
      !file.endsWith("/hooks/useToolTestContext.ts") &&
      NETWORK_PRIMITIVE.test(code);
    for (const position of backendTransportPositions(
      code,
      file,
      explicitApiTestTransport,
    )) {
      const evidence = evidenceAt(source, position);
      findings.push({
        id: `direct-transport:${file}:${evidence.line}:${evidence.column}`,
        kind: "direct-transport",
        file,
        evidence: evidence.text,
      });
    }
  }

  return findings.sort((a, b) => a.id.localeCompare(b.id));
}

function loadApprovals(): Approval[] {
  const value: unknown = JSON.parse(readFileSync(APPROVALS_PATH, "utf8"));
  if (!Array.isArray(value)) throw new Error("approvals file must be an array");
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("id" in entry) ||
      typeof entry.id !== "string" ||
      !("approvedBy" in entry) ||
      typeof entry.approvedBy !== "string" ||
      !("reason" in entry) ||
      typeof entry.reason !== "string" ||
      !entry.approvedBy.trim() ||
      !entry.reason.trim()
    ) {
      throw new Error(
        "each approval requires non-empty id, approvedBy, and reason fields",
      );
    }
    return entry as Approval;
  });
}

const strict = process.argv.includes("--strict");
const findings = scan();
const approvals = loadApprovals();
const approvedIds = new Set(approvals.map((approval) => approval.id));
const pending = findings.filter((item) => !approvedIds.has(item.id));
const staleApprovals = approvals.filter(
  (approval) => !findings.some((item) => item.id === approval.id),
);

if (pending.length === 0 && staleApprovals.length === 0) {
  console.log(
    `check:backend-boundaries — OK. ${findings.length} explicitly approved exception(s), none pending.`,
  );
  process.exit(0);
}

if (pending.length > 0) {
  console.log("\nBACKEND BOUNDARY APPROVAL REQUIRED");
  console.log(
    `${pending.length} remote/backend transport finding(s) bypass the canonical typed client/callApi boundary.`,
  );
  console.log(
    "Migrate each one, or have the user approve its exact id one-by-one in scripts/backend-boundary-approvals.json.\n",
  );
  for (const item of pending) {
    console.log(`  [${item.kind}] ${item.id}`);
    console.log(`    ${item.evidence}`);
  }
}

if (staleApprovals.length > 0) {
  console.log("\nSTALE BACKEND BOUNDARY APPROVALS");
  for (const approval of staleApprovals) console.log(`  ${approval.id}`);
  console.log(
    "Remove approvals as soon as the corresponding bypass disappears.",
  );
}

process.exit(strict ? 1 : 0);
