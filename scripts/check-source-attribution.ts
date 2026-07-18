#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  SOURCE_APPS,
  SOURCE_FEATURES,
} from "../features/agents/types/instance.types";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ROOTS = [
  "actions",
  "app",
  "components",
  "constants",
  "features",
  "hooks",
  "lib",
  "utils",
];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDED_DIRS = new Set([".next", "node_modules", "dist", "build"]);
const FEATURE_NAMES = new Set(SOURCE_FEATURES);
const APP_NAMES = new Set(SOURCE_APPS);

interface Finding {
  field: "source_app" | "source_feature";
  value: string;
  file: string;
  line: number;
}

function walk(dir: string, files: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
}

function fieldForName(name: string): Finding["field"] | null {
  const normalized = name.toLowerCase();
  if (normalized === "sourcefeature" || normalized.endsWith("source_feature")) {
    return "source_feature";
  }
  if (normalized === "sourceapp" || normalized.endsWith("source_app")) {
    return "source_app";
  }
  return null;
}

function propertyName(node: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

function stringValue(node: ts.Expression | ts.JsxAttributeValue | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isJsxExpression(node) && node.expression) {
    return stringValue(node.expression);
  }
  return null;
}

function addFinding(
  findings: Finding[],
  sourceFile: ts.SourceFile,
  node: ts.Node,
  name: string,
  value: string | null,
): void {
  const field = fieldForName(name);
  if (!field || !value) return;
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push({
    field,
    value,
    file: path.relative(REPO_ROOT, sourceFile.fileName),
    line: position.line + 1,
  });
}

function scanFile(file: string): Finding[] {
  const sourceText = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: Finding[] = [];

  function visit(node: ts.Node): void {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name) addFinding(findings, sourceFile, node, name, stringValue(node.initializer));
    } else if (ts.isJsxAttribute(node)) {
      addFinding(findings, sourceFile, node, node.name.getText(sourceFile), stringValue(node.initializer));
    } else if (ts.isVariableDeclaration(node)) {
      const name = propertyName(node.name);
      if (name) addFinding(findings, sourceFile, node, name, stringValue(node.initializer));
    } else if (ts.isParameter(node) && node.initializer) {
      const name = propertyName(node.name);
      if (name) addFinding(findings, sourceFile, node, name, stringValue(node.initializer));
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      addFinding(findings, sourceFile, node, node.left.text, stringValue(node.right));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

const files: string[] = [];
for (const root of ROOTS) walk(path.join(REPO_ROOT, root), files);
const findings = files.flatMap(scanFile);
const invalid = findings.filter((finding) =>
  finding.field === "source_app"
    ? !APP_NAMES.has(finding.value as (typeof SOURCE_APPS)[number])
    : !FEATURE_NAMES.has(finding.value as (typeof SOURCE_FEATURES)[number]),
);
const duplicateApps = duplicates(SOURCE_APPS);
const duplicateFeatures = duplicates(SOURCE_FEATURES);

if (invalid.length || duplicateApps.length || duplicateFeatures.length) {
  console.error("[FAIL] Source-attribution validation failed.");
  for (const finding of invalid) {
    console.error(
      `  ${finding.file}:${finding.line}: unregistered ${finding.field}=${JSON.stringify(finding.value)}`,
    );
  }
  if (duplicateApps.length) {
    console.error(`  duplicate SOURCE_APPS: ${duplicateApps.join(", ")}`);
  }
  if (duplicateFeatures.length) {
    console.error(`  duplicate SOURCE_FEATURES: ${duplicateFeatures.join(", ")}`);
  }
  process.exit(1);
}

const apps = new Set(findings.filter((item) => item.field === "source_app").map((item) => item.value));
const features = new Set(
  findings.filter((item) => item.field === "source_feature").map((item) => item.value),
);
console.log(
  `[OK] Source attribution: ${findings.length} literal stamps, ${apps.size} apps, ${features.size} features; all registered.`,
);
