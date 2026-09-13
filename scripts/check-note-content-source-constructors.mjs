#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const allowedConstructorFile = "features/notes/richDocumentSource.ts";
const ignoredDirectories = new Set([".git", ".next", "node_modules", ".matrx"]);
const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : sourceFiles(join(directory, entry.name));
    return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf("."))) ? [join(directory, entry.name)] : [];
  });
}

function propertyName(property) {
  return ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text
    : null;
}

export function findRawNoteContentSources(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map(node.properties.map((property) => [propertyName(property), property]));
      const type = properties.get("type");
      const isNote = type && ts.isPropertyAssignment(type) && ts.isStringLiteral(type.initializer) && type.initializer.text === "note";
      const isContentSourceShape = properties.has("noteId");
      if (isNote && isContentSourceShape && fileName.replaceAll("\\", "/") !== allowedConstructorFile) {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
        findings.push({ line: line + 1, column: character + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function runSelfTest() {
  const raw = findRawNoteContentSources('const source = { type: "note", mode: "identity", noteId: "n" };', "features/notes/components/Bad.tsx");
  const canonical = findRawNoteContentSources('const source = { type: "note", mode: "identity", noteId: "n" };', allowedConstructorFile);
  const unrelated = findRawNoteContentSources('const entity = { type: "note", id: "n" };', "features/crm/entity.ts");
  if (raw.length !== 1 || canonical.length !== 0 || unrelated.length !== 0) {
    throw new Error("Note content-source constructor guard self-test failed.");
  }
  console.log("note content-source constructor guard self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const findings = sourceFiles().flatMap((file) => {
  const relativeFile = relative(root, file).replaceAll("\\", "/");
  return findRawNoteContentSources(readFileSync(file, "utf8"), relativeFile)
    .map(({ line, column }) => `${relativeFile}:${line}:${column} raw Notes ContentSource; use noteIdentityContentSource or captureNoteEditSource`);
});
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("note content-source constructor census passed");
