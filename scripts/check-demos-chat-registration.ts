#!/usr/bin/env tsx
/**
 * Direct client-facing `@ai-matrx/chat` demos render through host-provided UI
 * slots. The main provider deliberately omits the full registration profile,
 * so each such demo route must mount DemosChatUiRegistrations in its own
 * layout instead of pulling the profile into the shared demos layout.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as ts from "typescript";

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

function registrationLayout(file: string): string | null {
  let dir = dirname(file);
  while (dir.startsWith(DEMOS)) {
    const layout = join(dir, "layout.dev.tsx");
    if (existsSync(layout) && readFileSync(layout, "utf8").includes("<DemosChatUiRegistrations")) return layout;
    if (dir === DEMOS) break;
    dir = dirname(dir);
  }
  return null;
}

const missing = files(DEMOS)
  .map((file) => ({ file, imports: uiImports(file) }))
  .filter(({ imports }) => imports.length > 0)
  .filter(({ file }) => !registrationLayout(file));

if (missing.length) {
  console.error("Direct chat UI imports without a route-scoped DemosChatUiRegistrations boundary:");
  for (const { file, imports } of missing) {
    console.error(`  ${relative(ROOT, file)}\n    ${imports.join("\n    ")}`);
  }
  process.exitCode = 1;
} else {
  console.log("✓ check:demos-chat-registration — every direct chat UI demo has a route-scoped registration boundary.");
}
