import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import type {
  UnwiredDetector,
  UnwiredFinding,
  UnwiredRepository,
} from "./types";

const FRONTEND_ROOTS = ["app", "components", "features", "hooks", "lib", "providers", "utils"];
const SKIP_PARTS = new Set([
  "__tests__",
  "fixtures",
  "generated",
  "node_modules",
  "test",
  "tests",
]);
const ENTRY_FILE_RE = /\/(?:page|layout|loading|error|global-error|not-found|template|default|route)(?:\.dev)?\.[cm]?[jt]sx?$/;
const TEST_FILE_RE = /(?:^|\/)(?:test_|[^/]+\.(?:test|spec|stories))\.[cm]?[jt]sx?$/;
const SERVICE_PATH_RE = /(?:^|\/)(?:services?|producers?)(?:\/|\.|$)/i;
const INSTALLER_RE = /^(?:set[A-Z0-9_].*Runner|install[A-Z0-9_].*Resolver)$/;

interface Candidate {
  key: string;
  file: string;
  exportName: string;
  localName: string;
  detector: Extract<
    UnwiredDetector,
    "react-component-unmounted" | "export-unimported" | "host-installer-unset"
  >;
  line: number;
  column: number;
  lines: number;
  kind: "component" | "hook" | "service" | "producer" | "installer";
}

interface ModuleFacts {
  path: string;
  directExports: Map<string, string>;
  namedReexports: Array<{ from: string; imported: string; exported: string }>;
  starReexports: string[];
  imports: Array<{
    from: string;
    defaultLocal: string | null;
    namespaceLocal: string | null;
    named: Array<{ imported: string; local: string }>;
  }>;
  jsxNames: Set<string>;
  calledNames: Set<string>;
  dynamicImports: string[];
  dynamicDirectories: string[];
}

export interface ScanResult {
  findings: UnwiredFinding[];
  filesScanned: number;
  partial: string[];
  aidreamCommit: string | null;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

function walk(root: string, relRoots: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".next") || SKIP_PARTS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        visit(full);
      } else if (/\.[cm]?[jt]sx?$/.test(entry) && !entry.endsWith(".d.ts")) {
        const rel = posix(relative(root, full));
        if (!TEST_FILE_RE.test(rel)) out.push(full);
      }
    }
  };
  for (const relRoot of relRoots) visit(join(root, relRoot));
  return out.sort();
}

function hasExport(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(
    modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function hasDefault(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(
    modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
  );
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function lineSpan(source: ts.SourceFile, node: ts.Node): number {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
  return Math.max(1, end - start + 1);
}

function location(source: ts.SourceFile, node: ts.Node): { line: number; column: number } {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { line: start.line + 1, column: start.character + 1 };
}

function classifyExport(file: string, name: string, node: ts.Node): Candidate["kind"] | null {
  if (INSTALLER_RE.test(name)) return "installer";
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  if (/Producer$/.test(name) || /producer/i.test(file)) return "producer";
  if (/Service$/.test(name) || SERVICE_PATH_RE.test(file)) return "service";
  if (/^[A-Z]/.test(name) && containsJsx(node)) return "component";
  return null;
}

function detectorFor(kind: Candidate["kind"]): Candidate["detector"] {
  if (kind === "component") return "react-component-unmounted";
  if (kind === "installer") return "host-installer-unset";
  return "export-unimported";
}

function resolveModule(root: string, importer: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(importer), specifier);
  else return null;
  const choices = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return choices.find((choice) => {
    if (!existsSync(choice) || extname(choice) === ".json") return false;
    try {
      return lstatSync(choice).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function factsFor(root: string, path: string, candidates: Candidate[]): ModuleFacts {
  const text = readFileSync(path, "utf8");
  const facts: ModuleFacts = {
    path,
    directExports: new Map(),
    namedReexports: [],
    starReexports: [],
    imports: [],
    jsxNames: new Set(),
    calledNames: new Set(),
    dynamicImports: [],
    dynamicDirectories: [],
  };
  const rel = posix(relative(root, path));

  // The graph is intentionally a compact text pass. Parsing every one of this
  // repo's ~7k TS files into a retained AST makes the advisory gate itself an
  // OOM risk. ASTs are reserved for files that can declare a target artifact.
  const importRe = /\bimport\s+(?!\()([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(importRe)) {
    const rawClause = (match[1] ?? "").trim();
    if (!rawClause || rawClause.startsWith("type ")) continue;
    const target = resolveModule(root, path, match[2] ?? "");
    if (!target) continue;
    const named: Array<{ imported: string; local: string }> = [];
    const braces = rawClause.match(/\{([\s\S]*?)\}/);
    if (braces) {
      for (const part of (braces[1] ?? "").split(",")) {
        const clean = part.trim();
        if (!clean || clean.startsWith("type ")) continue;
        const [imported, local] = clean.split(/\s+as\s+/);
        if (imported) named.push({ imported: imported.trim(), local: (local ?? imported).trim() });
      }
    }
    const namespace = rawClause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    const beforeNamed = rawClause.split(/[,\{*]/, 1)[0]?.trim() ?? "";
    facts.imports.push({
      from: target,
      defaultLocal: /^[A-Za-z_$][\w$]*$/.test(beforeNamed) ? beforeNamed : null,
      namespaceLocal: namespace?.[1] ?? null,
      named,
    });
  }

  const namedExportRe = /\bexport\s+(?!type\b)\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(namedExportRe)) {
    const target = resolveModule(root, path, match[2] ?? "");
    if (!target) continue;
    for (const part of (match[1] ?? "").split(",")) {
      const clean = part.trim();
      if (!clean || clean.startsWith("type ")) continue;
      const [imported, exported] = clean.split(/\s+as\s+/);
      if (imported) facts.namedReexports.push({ from: target, imported: imported.trim(), exported: (exported ?? imported).trim() });
    }
  }
  const starExportRe = /\bexport\s+\*\s+from\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(starExportRe)) {
    const target = resolveModule(root, path, match[1] ?? "");
    if (target) facts.starReexports.push(target);
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const target = resolveModule(root, path, match[1] ?? "");
    if (target) facts.dynamicImports.push(target);
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*`([^`]*?)\$\{/g)) {
    const prefix = match[1] ?? "";
    const directory = prefix.startsWith("@/")
      ? resolve(root, prefix.slice(2))
      : prefix.startsWith(".")
        ? resolve(dirname(path), prefix)
        : null;
    if (directory && existsSync(directory)) facts.dynamicDirectories.push(directory.replace(/\/$/, ""));
  }
  for (const match of text.matchAll(/<([A-Z][A-Za-z0-9_$.]*)\b/g)) {
    const rootName = (match[1] ?? "").split(/[.$]/)[0];
    if (rootName) facts.jsxNames.add(rootName);
  }
  for (const match of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (match[1]) facts.calledNames.add(match[1]);
  }

  const candidateDeclarationRe = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(?:use[A-Z0-9][A-Za-z0-9_$]*|[A-Z][A-Za-z0-9_$]*|[A-Za-z0-9_$]*(?:Service|Producer|Runner|Resolver))\b/;
  if (candidateDeclarationRe.test(text) || (SERVICE_PATH_RE.test(rel) && /\bexport\s+/.test(text))) {
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const addCandidate = (name: string, exportName: string, node: ts.Node): void => {
      const kind = classifyExport(rel, name, node);
      if (!kind || (kind === "component" && ENTRY_FILE_RE.test(`/${rel}`))) return;
      const where = location(source, node);
      const candidate: Candidate = {
        key: `${path}#${exportName}`,
        file: rel,
        exportName,
        localName: name,
        detector: detectorFor(kind),
        line: where.line,
        column: where.column,
        lines: lineSpan(source, node),
        kind,
      };
      candidates.push(candidate);
      facts.directExports.set(exportName, candidate.key);
    };
    for (const statement of source.statements) {
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        hasExport(statement) &&
        statement.name
      ) {
        addCandidate(statement.name.text, hasDefault(statement) ? "default" : statement.name.text, statement);
      } else if (ts.isVariableStatement(statement) && hasExport(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) addCandidate(declaration.name.text, declaration.name.text, declaration);
        }
      } else if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
        const exportedName = statement.expression.text;
        const existing = candidates.find(
          (candidate) =>
            candidate.file === rel && candidate.localName === exportedName,
        );
        if (existing) facts.directExports.set("default", existing.key);
      }
    }
  }
  return facts;
}

function featureOf(repository: UnwiredRepository, file: string): string {
  const parts = file.split("/");
  if (repository === "aidream") {
    if (parts[0] === "packages") return parts.slice(0, 2).join("/");
    return parts.slice(0, Math.min(3, parts.length - 1)).join("/") || "aidream";
  }
  if (parts[0] === "features") return parts.slice(0, 2).join("/");
  if (parts[0] === "app") return parts.slice(0, 3).join("/");
  return parts[0] || "root";
}

export function scanFrontendUnwired(root: string): { findings: UnwiredFinding[]; filesScanned: number } {
  const paths = walk(root, FRONTEND_ROOTS);
  const candidates: Candidate[] = [];
  const facts = paths.map((path) => factsFor(root, path, candidates));
  const exports = new Map<string, Map<string, string>>(
    facts.map((fact) => [fact.path, new Map(fact.directExports)]),
  );

  // Resolve barrels to the original candidate. Re-exporting is not a runtime consumer.
  for (let pass = 0; pass < facts.length; pass += 1) {
    let changed = false;
    for (const fact of facts) {
      const out = exports.get(fact.path) ?? new Map<string, string>();
      for (const edge of fact.namedReexports) {
        const candidate = exports.get(edge.from)?.get(edge.imported);
        if (candidate && !out.has(edge.exported)) {
          out.set(edge.exported, candidate);
          changed = true;
        }
      }
      for (const target of fact.starReexports) {
        for (const [name, candidate] of exports.get(target) ?? []) {
          if (name !== "default" && !out.has(name)) {
            out.set(name, candidate);
            changed = true;
          }
        }
      }
      exports.set(fact.path, out);
    }
    if (!changed) break;
  }

  const importedBy = new Map<string, Set<string>>();
  const mountedBy = new Map<string, Set<string>>();
  const calledBy = new Map<string, Set<string>>();
  const localCandidates = new Map(
    candidates.map((candidate) => [`${candidate.file}#${candidate.localName}`, candidate] as const),
  );
  const mark = (map: Map<string, Set<string>>, key: string, file: string): void => {
    const set = map.get(key) ?? new Set<string>();
    set.add(file);
    map.set(key, set);
  };
  for (const fact of facts) {
    const localToCandidate = new Map<string, string>();
    for (const entry of fact.imports) {
      const targetExports = exports.get(entry.from);
      if (!targetExports) continue;
      if (entry.defaultLocal) {
        const key = targetExports.get("default");
        if (key) {
          mark(importedBy, key, fact.path);
          localToCandidate.set(entry.defaultLocal, key);
          if (fact.calledNames.has(entry.defaultLocal)) mark(calledBy, key, fact.path);
        }
      }
      for (const named of entry.named) {
        const key = targetExports.get(named.imported);
        if (key) {
          mark(importedBy, key, fact.path);
          localToCandidate.set(named.local, key);
          if (fact.calledNames.has(named.local)) mark(calledBy, key, fact.path);
        }
      }
      if (entry.namespaceLocal) {
        for (const key of new Set(targetExports.values())) mark(importedBy, key, fact.path);
      }
    }
    for (const target of fact.dynamicImports) {
      for (const key of new Set(exports.get(target)?.values() ?? [])) {
        mark(importedBy, key, fact.path);
        // A dynamic module edge is itself the mounter boundary: next/dynamic or
        // React.lazy returns a wrapper with a different local name, so no JSX
        // tag can resolve directly to the original export.
        mark(mountedBy, key, fact.path);
      }
    }
    for (const directory of fact.dynamicDirectories) {
      for (const [modulePath, moduleExports] of exports) {
        if (!modulePath.startsWith(`${directory}${sep}`)) continue;
        for (const key of new Set(moduleExports.values())) {
          mark(importedBy, key, fact.path);
          mark(mountedBy, key, fact.path);
        }
      }
    }
    for (const jsxName of fact.jsxNames) {
      const imported = localToCandidate.get(jsxName);
      if (imported) mark(mountedBy, imported, fact.path);
      const local = localCandidates.get(`${posix(relative(root, fact.path))}#${jsxName}`);
      if (local) mark(mountedBy, local.key, fact.path);
    }
  }

  const findings: UnwiredFinding[] = [];
  for (const candidate of candidates) {
    const consumers =
      candidate.detector === "react-component-unmounted"
        ? mountedBy
        : candidate.detector === "host-installer-unset"
          ? calledBy
          : importedBy;
    if ((consumers.get(candidate.key)?.size ?? 0) > 0) continue;
    const evidence =
      candidate.detector === "react-component-unmounted"
        ? "no JSX tag in the runtime TypeScript graph resolves to this exported component"
        : candidate.detector === "host-installer-unset"
          ? "the package exposes a required runner/resolver installer, but no runtime module calls it"
          : "no runtime import resolves to this exported hook, service, or producer; tests and re-export barrels do not count";
    const remains =
      candidate.detector === "react-component-unmounted"
        ? "mount it from the page, panel, overlay, or parent surface it was built for, then exercise that user path"
        : candidate.detector === "host-installer-unset"
          ? "call the installer from the owning host startup path with the implementation its package expects, then exercise the dependent path"
          : "wire the runtime consumer it was built for, then prove a real page, action, producer, or workflow reaches it";
    findings.push({
      repository: "matrx-frontend",
      detector: candidate.detector,
      file: candidate.file,
      line: candidate.line,
      column: candidate.column,
      symbol: candidate.localName,
      lines: candidate.lines,
      title: `${candidate.localName} appears unfinished — it is built but has no runtime consumer`,
      evidence,
      intent: `an exported ${candidate.kind} with ${candidate.lines} implementation line(s)`,
      remains,
      feature: featureOf("matrx-frontend", candidate.file),
    });
  }
  return { findings, filesScanned: paths.length };
}

interface PythonFinding {
  detector: string;
  key: string;
  title: string;
  evidence: string;
  remains: string;
  intent: string;
}

interface PythonReport {
  findings: PythonFinding[];
  suppressed: number;
  partial: string[];
}

function pythonDetector(detector: string): UnwiredDetector | null {
  switch (detector) {
    case "router-unmounted":
      return "router-unmounted";
    case "host-seam":
      return "host-installer-unset";
    case "system-task":
      return "scheduler-handler-unregistered";
    case "module-unreached":
      return "python-module-unreached";
    case "service-unreached":
      return "export-unimported";
    default:
      return null;
  }
}

function pythonLocation(finding: PythonFinding): { file: string; line: number; symbol: string } {
  const pathHit = finding.title.match(/((?:aidream|packages)\/[A-Za-z0-9_./-]+\.py):(\d+)/);
  const keyHit = finding.key.match(/^((?:aidream|packages)\/[A-Za-z0-9_./-]+\.py)(?::(.+))?$/);
  const file = pathHit?.[1] ?? keyHit?.[1] ?? "aidream/services/scheduling/system_task_runner.py";
  const line = Number(pathHit?.[2] ?? finding.title.match(/\.py:(\d+)/)?.[1] ?? 1);
  const symbol = keyHit?.[2] ?? finding.key.split(":").at(-1) ?? finding.detector;
  return { file, line: Number.isFinite(line) ? Math.max(1, line) : 1, symbol };
}

function countLines(path: string): number {
  try {
    return Math.max(1, readFileSync(path, "utf8").split(/\r?\n/).length);
  } catch {
    return 1;
  }
}

function pythonImplementationLines(path: string, line: number, detector: UnwiredDetector): number {
  const all = readFileSync(path, "utf8").split(/\r?\n/);
  if (detector === "router-unmounted" || detector === "python-module-unreached") return Math.max(1, all.length);
  const start = Math.max(0, line - 1);
  const first = all[start] ?? "";
  const indentation = first.match(/^\s*/)?.[0].length ?? 0;
  let end = start + 1;
  for (; end < all.length; end += 1) {
    const current = all[end] ?? "";
    if (current.trim().length === 0 || current.trimStart().startsWith("#")) continue;
    const currentIndent = current.match(/^\s*/)?.[0].length ?? 0;
    if (currentIndent <= indentation && !current.trimStart().startsWith("@")) break;
  }
  return Math.max(1, end - start);
}

function countPythonFiles(root: string): number {
  let count = 0;
  const visit = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_PARTS.has(entry) || entry === "__pycache__" || entry === ".venv") continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(full);
      else if (entry.endsWith(".py") && !entry.startsWith("test_")) count += 1;
    }
  };
  visit(join(root, "aidream"));
  visit(join(root, "packages"));
  return count;
}

function gitCommit(root: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function aidreamFindings(aidreamRoot: string): {
  findings: UnwiredFinding[];
  partial: string[];
  filesScanned: number;
  commit: string | null;
} {
  if (!existsSync(join(aidreamRoot, "scripts/check_unwired.py"))) {
    return {
      findings: [],
      partial: [`aidream checkout not found at ${aidreamRoot}; cross-repo detectors did not run, so this report is not clean proof`],
      filesScanned: 0,
      commit: null,
    };
  }
  try {
    const stdout = execFileSync(
      "uv",
      [
        "run",
        "python",
        "scripts/check_unwired.py",
        "--json",
        "--only",
        "router-unmounted",
        "--only",
        "module-unreached",
        "--only",
        "service-unreached",
        "--only",
        "host-seam",
        "--only",
        "system-task",
      ],
      {
        cwd: aidreamRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    // aidream startup validation can print a colored banner before the JSON
    // contract. The checker payload has a stable opening key; anything before
    // it is diagnostic noise, not a reason to discard the cross-repo result.
    const jsonStart = stdout.indexOf('{\n  "findings"');
    if (jsonStart < 0) throw new Error("aidream checker returned no JSON findings contract");
    const report = JSON.parse(stdout.slice(jsonStart)) as PythonReport;
    const findings: UnwiredFinding[] = [];
    for (const source of report.findings) {
      const detector = pythonDetector(source.detector);
      if (!detector) continue;
      const where = pythonLocation(source);
      const sourcePath = join(aidreamRoot, where.file);
      const lines = existsSync(sourcePath)
        ? pythonImplementationLines(sourcePath, where.line, detector)
        : countLines(sourcePath);
      findings.push({
        repository: "aidream",
        detector,
        file: where.file,
        line: where.line,
        column: 1,
        symbol: where.symbol,
        lines,
        title: source.title,
        evidence: source.evidence,
        intent: source.intent || `a purpose-built ${source.detector} artifact`,
        remains: source.remains,
        feature: featureOf("aidream", where.file),
      });
    }
    return {
      findings,
      partial: report.partial ?? [],
      filesScanned: countPythonFiles(aidreamRoot),
      commit: gitCommit(aidreamRoot),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      findings: [],
      partial: [`aidream checker failed (${message.slice(0, 240)}); cross-repo detectors are incomplete, so this report is not clean proof`],
      filesScanned: 0,
      commit: gitCommit(aidreamRoot),
    };
  }
}

export function scanUnwired(root: string): ScanResult {
  if (process.env.UNWIRED_DEBUG === "1") console.error("[unwired/debug] frontend scan starting");
  const frontend = scanFrontendUnwired(root);
  if (process.env.UNWIRED_DEBUG === "1") console.error(`[unwired/debug] frontend scan complete: ${frontend.filesScanned}`);
  const aidreamRoot = resolve(root, "..", "aidream");
  if (process.env.UNWIRED_DEBUG === "1") console.error("[unwired/debug] aidream scan starting");
  const aidream = aidreamFindings(aidreamRoot);
  if (process.env.UNWIRED_DEBUG === "1") console.error(`[unwired/debug] aidream scan complete: ${aidream.findings.length}`);
  return {
    findings: [...frontend.findings, ...aidream.findings].sort(
      (a, b) => b.lines - a.lines || a.repository.localeCompare(b.repository) || a.file.localeCompare(b.file) || a.line - b.line,
    ),
    filesScanned: frontend.filesScanned + aidream.filesScanned,
    partial: aidream.partial,
    aidreamCommit: aidream.commit,
  };
}
