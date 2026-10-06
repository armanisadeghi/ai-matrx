#!/usr/bin/env tsx
/**
 * Direct client-facing `@ai-matrx/chat` demos render through host-provided UI
 * slots. The main provider deliberately omits the full registration profile,
 * so each such demo route must mount DemosChatUiRegistrations in its own
 * layout instead of pulling the profile into the shared demos layout.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import * as ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = process.cwd();
const DEMOS = join(ROOT, "app", "(dev)", "demos");
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const UI_IMPORTS = [
  "@ai-matrx/chat/agents/components/",
  "@ai-matrx/chat/agents/hooks/",
  "@ai-matrx/chat/agents/ui-first-tools/ui/",
  "@ai-matrx/chat/canvas/",
  "@ai-matrx/chat/cx-chat/components/",
  "@ai-matrx/chat/surfaces/runtime/",
  "@ai-matrx/chat/tool-call-visualization/components/",
  "@ai-matrx/chat/tool-call-visualization/registry/",
  "@ai-matrx/chat/tool-call-visualization/renderers/",
  "@ai-matrx/chat/tool-call-visualization/result-fields/",
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : files(path);
    return SOURCE.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [path] : [];
  });
}

function uiImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports: string[] = [];
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const specifier = node.moduleSpecifier.text;
    if (UI_IMPORTS.some((prefix) => specifier.startsWith(prefix))) imports.push(specifier);
  });
  return imports;
}

function registrationLayout(file: string, demos: string): string | null {
  let dir = dirname(file);
  while (dir.startsWith(demos)) {
    const layout = join(dir, "layout.dev.tsx");
    if (existsSync(layout) && readFileSync(layout, "utf8").includes("<DemosChatUiRegistrations")) return layout;
    if (dir === demos) break;
    dir = dirname(dir);
  }
  return null;
}

function missingRegistrations(demos: string) {
  return files(demos)
    .map((file) => ({ file, imports: uiImports(file) }))
    .filter(({ imports }) => imports.length > 0)
    .filter(({ file }) => !registrationLayout(file, demos));
}

if (process.argv.includes("--self-test")) {
  const root = mkdtempSync(join(tmpdir(), "demos-chat-registration-"));
  try {
    const demos = join(root, "app", "(dev)", "demos");
    const route = join(demos, "uncovered");
    mkdirSync(route, { recursive: true });
    writeFileSync(join(route, "page.dev.tsx"), 'import { GenericRenderer } from "@ai-matrx/chat/tool-call-visualization/registry/GenericRenderer";\nexport default GenericRenderer;\n');
    if (missingRegistrations(demos).length !== 1) throw new Error("uncovered registry UI import was not rejected");
    writeFileSync(join(route, "layout.dev.tsx"), 'import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";\nexport default function Layout({ children }: { children: React.ReactNode }) { return <><DemosChatUiRegistrations />{children}</>; }\n');
    if (missingRegistrations(demos).length !== 0) throw new Error("covered registry UI import was rejected");
    console.log("✓ check:demos-chat-registration:self-test — uncovered route fails; covered route passes.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  exitAfterDrain(0);
}

const missing = missingRegistrations(DEMOS);

if (missing.length) {
  console.error("Direct chat UI imports without a route-scoped DemosChatUiRegistrations boundary:");
  for (const { file, imports } of missing) {
    console.error(`  ${relative(ROOT, file)}\n    ${imports.join("\n    ")}`);
  }
  process.exitCode = 1;
} else {
  console.log("✓ check:demos-chat-registration — every direct chat UI demo has a route-scoped registration boundary.");
}
