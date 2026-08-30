import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

import { COMING_SOON } from "../../lib/coming-soon/registry";

export type ComingSoonFindingKind =
  | "bare-jsx"
  | "bare-toast"
  | "user-facing-data"
  | "context-review";

export interface ComingSoonFinding {
  file: string;
  line: number;
  column: number;
  kind: ComingSoonFindingKind;
  route: "repair-now" | "review";
  text: string;
}

export interface ComingSoonSourceScan {
  findings: ComingSoonFinding[];
  announcedIds: string[];
  dynamicAnnouncers: Array<{ file: string; line: number; column: number }>;
}

export interface ComingSoonRepositoryScan extends ComingSoonSourceScan {
  filesScanned: number;
  registryEntries: number;
  unknownAnnouncedIds: string[];
}

const RUNTIME_ROOTS = ["app", "components", "features", "hooks", "lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const PROMISE_LANGUAGE = /\bcoming[\s-]+soon\b/i;
const SOON_BADGE = /^\s*soon\s*$/i;
const USER_FACING_KEYS = new Set([
  "badge",
  "description",
  "label",
  "message",
  "placeholder",
  "subtitle",
  "text",
  "title",
  "tooltip",
]);

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function isExcluded(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return (
    normalized.startsWith("lib/coming-soon/") ||
    normalized.includes("/__tests__/") ||
    /\.(test|spec)\.[jt]sx?$/.test(normalized) ||
    normalized.endsWith(".d.ts") ||
    normalized.includes("/generated/") ||
    normalized.includes(".generated.")
  );
}

function sourceFiles(repoRoot: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
        const repoRelative = relative(repoRoot, absolute);
        if (!isExcluded(repoRelative)) files.push(absolute);
      }
    }
  };

  for (const root of RUNTIME_ROOTS) visit(join(repoRoot, root));
  return files.sort();
}

function enclosingCall(node: ts.Node): ts.CallExpression | undefined {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isCallExpression(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function enclosingProperty(node: ts.Node): ts.PropertyAssignment | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current)) return current;
    if (
      ts.isVariableDeclaration(current) ||
      ts.isCallExpression(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function isInsideJsx(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isJsxAttribute(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function literalText(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node) || ts.isJsxText(node)) {
    return node.getText(sourceFile);
  }
  return undefined;
}

function propertyName(property: ts.PropertyAssignment): string | undefined {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return undefined;
}

function classifyFinding(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): Pick<ComingSoonFinding, "kind" | "route"> {
  if (ts.isJsxText(node) || isInsideJsx(node)) {
    return { kind: "bare-jsx", route: "repair-now" };
  }

  const call = enclosingCall(node);
  const callee = call?.expression.getText(sourceFile) ?? "";
  if (/^(toast|notify)(\.|$)/.test(callee)) {
    return { kind: "bare-toast", route: "repair-now" };
  }

  const property = enclosingProperty(node);
  const name = property ? propertyName(property) : undefined;
  if (name && USER_FACING_KEYS.has(name)) {
    return { kind: "user-facing-data", route: "repair-now" };
  }

  return { kind: "context-review", route: "review" };
}

export function scanSourceText(
  sourceText: string,
  file = "fixture.tsx",
): ComingSoonSourceScan {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const findings: ComingSoonFinding[] = [];
  const announcedIds: string[] = [];
  const dynamicAnnouncers: ComingSoonSourceScan["dynamicAnnouncers"] = [];
  const seenStarts = new Set<number>();

  const location = (node: ts.Node) => {
    const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { file, line: point.line + 1, column: point.character + 1 };
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);
      if (callee === "announceComingSoon") {
        const first = node.arguments[0];
        if (first && ts.isStringLiteralLike(first)) announcedIds.push(first.text);
        else dynamicAnnouncers.push(location(node));
      }
    }

    const text = literalText(node, sourceFile);
    if (text && (PROMISE_LANGUAGE.test(text) || (ts.isJsxText(node) && SOON_BADGE.test(text)))) {
      const start = node.getStart(sourceFile);
      const call = enclosingCall(node);
      const isRegisteredCall =
        call?.expression.getText(sourceFile) === "announceComingSoon";
      const isModuleSpecifier =
        ts.isStringLiteral(node) &&
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent));
      if (!seenStarts.has(start) && !isRegisteredCall && !isModuleSpecifier) {
        seenStarts.add(start);
        findings.push({
          ...location(node),
          ...classifyFinding(node, sourceFile),
          text: normalizeText(text),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { findings, announcedIds, dynamicAnnouncers };
}

export function scanRepository(repoRoot = process.cwd()): ComingSoonRepositoryScan {
  const root = resolve(repoRoot);
  const files = sourceFiles(root);
  const aggregate: ComingSoonSourceScan = {
    findings: [],
    announcedIds: [],
    dynamicAnnouncers: [],
  };

  for (const absolute of files) {
    const repoRelative = relative(root, absolute).replaceAll("\\", "/");
    const result = scanSourceText(readFileSync(absolute, "utf8"), repoRelative);
    aggregate.findings.push(...result.findings);
    aggregate.announcedIds.push(...result.announcedIds);
    aggregate.dynamicAnnouncers.push(...result.dynamicAnnouncers);
  }

  const declaredIds = new Set(Object.keys(COMING_SOON));
  return {
    ...aggregate,
    filesScanned: files.length,
    registryEntries: declaredIds.size,
    unknownAnnouncedIds: [...new Set(aggregate.announcedIds)]
      .filter((id) => !declaredIds.has(id))
      .sort(),
  };
}

export function runCli(argv = process.argv.slice(2)): number {
  const result = scanRepository();
  const repairNow = result.findings.filter((finding) => finding.route === "repair-now");
  const review = result.findings.filter((finding) => finding.route === "review");

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `P9 coming-soon detector: ${result.filesScanned} files · ${result.registryEntries} registry entries · ${repairNow.length} repair-now · ${review.length} review · ${result.unknownAnnouncedIds.length} unknown ids · ${result.dynamicAnnouncers.length} dynamic ids`,
    );
    for (const finding of result.findings) {
      console.log(
        `[${finding.route}] ${finding.file}:${finding.line}:${finding.column} ${finding.kind} — ${finding.text}`,
      );
    }
    for (const id of result.unknownAnnouncedIds) {
      console.log(`[repair-now] unknown announceComingSoon id — ${id}`);
    }
    for (const finding of result.dynamicAnnouncers) {
      console.log(
        `[review] ${finding.file}:${finding.line}:${finding.column} dynamic announceComingSoon id`,
      );
    }
  }

  return argv.includes("--strict") &&
    (repairNow.length > 0 || result.unknownAnnouncedIds.length > 0)
    ? 1
    : 0;
}

if (require.main === module) process.exitCode = runCli();
