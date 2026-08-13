#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function tagName(node, sourceFile) {
  return node.tagName.getText(sourceFile);
}

function attributeNames(node, sourceFile) {
  return new Set(
    node.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => attribute.name.getText(sourceFile)),
  );
}

function excludedPath(file) {
  return (
    /(?:^|\/)__tests__(?:\/|$)/.test(file) ||
    /\.(?:test|spec|stories)\.tsx$/.test(file) ||
    /(?:^|\/)app\/\(dev\)\//.test(file) ||
    /(?:^|\/)component-displays\//.test(file) ||
    file.endsWith("components/official/matrx-data-table/MatrxDataTable.tsx")
  );
}

function hasEquivalentControls(source) {
  const wholeList = source.includes("<CopyButtons");
  const rowAi =
    /\bid\s*:\s*["']copy-ai["']/.test(source) ||
    /\blabel\s*:\s*["']Copy for AI["']/.test(source) ||
    source.includes("<CopyForAiButton") ||
    source.includes("<CopyForAiIcon");
  return wholeList && rowAi;
}

export function classifySource(file, source) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const results = [];
  const equivalentControls = hasEquivalentControls(source);

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      tagName(node, sourceFile) === "MatrxDataTable"
    ) {
      const attributes = attributeNames(node, sourceFile);
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      let status;
      if (attributes.has("copy")) status = "compliant";
      else if (excludedPath(file)) status = "excluded";
      else if (equivalentControls) status = "equivalent-controls";
      else if (attributes.has("toolbar")) status = "auto-approved";
      else status = "review";
      results.push({ file, line, status });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

function trackedTsxFiles() {
  return execFileSync(
    "rg",
    ["--files", "app", "components", "features", "lib", "-g", "*.tsx"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
}

function run() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const requested = args.filter((arg) => arg !== "--json");
  const files = requested.length > 0 ? requested : trackedTsxFiles();
  const results = files.flatMap((file) => {
    const absolute = resolve(ROOT, file);
    return classifySource(file, readFileSync(absolute, "utf8"));
  });
  const counts = Object.fromEntries(
    [
      "compliant",
      "auto-approved",
      "equivalent-controls",
      "review",
      "excluded",
    ].map((status) => [
      status,
      results.filter((result) => result.status === status).length,
    ]),
  );

  if (json) {
    process.stdout.write(`${JSON.stringify({ counts, results }, null, 2)}\n`);
    return;
  }

  for (const result of results.filter(
    (item) => item.status === "auto-approved" || item.status === "review",
  )) {
    process.stdout.write(
      `${result.status.toUpperCase()} ${result.file}:${result.line}\n`,
    );
  }
  process.stdout.write(`P5 MatrxDataTable: ${JSON.stringify(counts)}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) run();
