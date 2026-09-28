// remedies.test.mjs — every hint the visibility-vocabulary check prints names a remedy the check
// ACCEPTS and a caller can IMPORT (the frontend twin of aidream tests/test_file_access_gate_remedies.py).
//
// Red before 2026-09-28: the hint said "normalize legacy reads via toVisibility()" while
// `toVisibility` was private to features/files/redux/converters.ts.
//
// Run: `node --test scripts/visibility-vocab/remedies.test.mjs` (pnpm test:visibility-remedies).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FINDINGS_CHECKS } from "../findings/registry.mjs";
import { REMEDIES, remedyForKey } from "./remedies.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = join(ROOT, "scripts", "check-visibility-vocab.ts");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const KINDS_THE_CHECK_EMITS = ["collapsedUnion", "onlyYouClaim", "retiredSpelling"];

function moduleFile(spec) {
  assert.ok(spec.startsWith("@/"), `${spec}: remedies import through the @/ alias`);
  const base = join(ROOT, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function exports(file, name) {
  const text = readFileSync(file, "utf8");
  const declared = new RegExp(
    `export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+${name}\\b`,
  );
  const listed = new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return declared.test(text) || listed.test(text);
}

/** Run the REAL check over one file in a throwaway git repository; returns { items, stdout }. */
function runCheckOn(source) {
  const dir = mkdtempSync(join(tmpdir(), "vis-remedy-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(dir, "example.tsx"), source);
  git("add", "example.tsx");
  const run = spawnSync(TSX, [CHECK], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, MATRX_ITEMS: "1", NO_COLOR: "1" },
  });
  assert.equal(run.status, 0, `the check crashed: ${run.stderr}`);
  const items = run.stdout
    .split("\n")
    .filter((l) => l.startsWith("MATRX-ITEM "))
    .map((l) => JSON.parse(l.slice("MATRX-ITEM ".length)));
  return { items, stdout: run.stdout };
}

test("every class the check emits has a remedy", () => {
  assert.deepEqual(Object.keys(REMEDIES).sort(), KINDS_THE_CHECK_EMITS);
});

for (const kind of KINDS_THE_CHECK_EMITS) {
  const remedy = REMEDIES[kind];

  test(`[${kind}] every symbol the remedy imports is exported where it says`, () => {
    for (const { name, from } of remedy.imports) {
      const file = moduleFile(from);
      assert.ok(file, `${from} (named by [${kind}]) does not exist`);
      assert.ok(exports(file, name), `${name} is not exported from ${from} — a caller cannot import it`);
    }
  });

  test(`[${kind}] every function or component the hint names is one of its imports`, () => {
    const named = new Set([
      ...[...remedy.fix.matchAll(/\b([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]),
      ...[...remedy.fix.matchAll(/<([A-Z][\w$]*)/g)].map((m) => m[1]),
    ]);
    const imported = new Set(remedy.imports.map((i) => i.name));
    for (const name of named) assert.ok(imported.has(name), `the hint names ${name} but says nowhere to import it from`);
    for (const { name, from } of remedy.imports) {
      assert.ok(remedy.fix.includes(name) && remedy.fix.includes(from), `the hint must name ${name} and ${from}`);
    }
  });

  test(`[${kind}] the check reports BEFORE, prints this remedy, and accepts AFTER`, () => {
    const before = runCheckOn(remedy.before);
    assert.ok(
      before.items.some((i) => i.rule === kind && i.status === "new"),
      `BEFORE is not reported as [${kind}]: ${JSON.stringify(before.items)}`,
    );
    assert.ok(before.stdout.includes(remedy.fix), `the check does not print the [${kind}] remedy`);
    const after = runCheckOn(remedy.after);
    assert.deepEqual(
      after.items.filter((i) => i.status === "new"),
      [],
      `following the [${kind}] remedy still leaves a finding`,
    );
  });
}

test("the findings registry hands each item its own class's remedy", () => {
  const check = FINDINGS_CHECKS.find((c) => c.id === "visibility-vocabulary");
  assert.ok(check?.fixFor, "the registry entry carries no per-item remedy");
  for (const kind of KINDS_THE_CHECK_EMITS) {
    const key = `${kind}|features/x/Example.tsx|*`;
    assert.equal(check.fixFor(key), REMEDIES[kind].fix);
    assert.equal(remedyForKey(key), REMEDIES[kind].fix);
  }
});
