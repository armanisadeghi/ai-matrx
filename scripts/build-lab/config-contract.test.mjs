import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Parse instead of loading next.config.js: loading runs copy/parking hooks.
test("production builds explicitly retain the measured nonpersistent Turbopack mode", () => {
  const source = ts.createSourceFile(
    "next.config.js",
    readFileSync(new URL("../../next.config.js", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => entry.name.getText(source) === "nextConfig");
  assert.ok(declaration && ts.isObjectLiteralExpression(declaration.initializer));
  const property = (object, name) => {
    const matches = object.properties.filter(
      (entry) => ts.isPropertyAssignment(entry) && entry.name.getText(source) === name,
    );
    assert.equal(matches.length, 1, `Expected one explicit ${name} setting`);
    return matches[0].initializer;
  };
  const experimental = property(declaration.initializer, "experimental");
  assert.ok(ts.isObjectLiteralExpression(experimental));
  assert.equal(
    property(experimental, "turbopackFileSystemCacheForBuild").kind,
    ts.SyntaxKind.FalseKeyword,
    "Re-enabling persistent build caching requires a new measured memory acceptance",
  );
});
