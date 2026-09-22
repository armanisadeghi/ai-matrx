#!/usr/bin/env node
/**
 * EVERY PERSON-FACING `validateCellValue` REFUSAL GOES THROUGH THE ONE PRIMITIVE.
 *
 * 🚨 THE CLASS THIS GUARDS (lane VALIDATION-REFUSAL, 2026-09-23).
 *
 * Five places in this app asked a column "may I write this value?" and five places
 * answered a person differently when it said no: a destructive toast on the grid
 * cell that timed out while the editor sat open holding the rejected text, a bare
 * red sentence with no remedy in each row modal, and a toast naming three of a
 * paste's refusals AFTER the rest of the block had already been written. FIX-15
 * had already fixed the STORE's half of exactly this and named this half as what
 * it left behind.
 *
 * One question gets one answer: `columnRuleRefusal()` builds it and
 * `<FieldRuleRefusal>` draws it. This guard is what stops the sixth surface —
 * whoever writes it next — from inventing a seventh answer, because a formatter
 * nobody is forced through is a formatter somebody bypasses next week.
 *
 * WHAT IT CHECKS, and deliberately nothing more: in each file below, the branch
 * that handles a FAILED verdict reaches `columnRuleRefusal`, and no `toast(` call
 * appears inside that branch. It does not police the agent write-back handler
 * (`useDataTableWriteHandlers`) or the read-only amber renderer
 * (`FormattedFieldValue`) — see the census in this lane's log: neither shows a
 * person a refusal, and forcing a person's notice into an agent's error envelope
 * would be the same mistake in the other direction.
 *
 * Self-test: `node scripts/check-validation-refusal-surfaces.mjs --self-test`
 * — it reintroduces the pre-fix toast in memory and requires the check to FAIL.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The person-facing surfaces. A new one belongs here the day it is written. */
const SURFACES = [
  {
    file: "features/data-tables/components/EditableCell.tsx",
    family: "grid cell",
  },
  {
    file: "components/user-generated-table-data/AddRowModal.tsx",
    family: "row modal (create)",
  },
  {
    file: "components/user-generated-table-data/EditRowModal.tsx",
    family: "row modal (edit)",
  },
  {
    file: "components/user-generated-table-data/UserTableViewer.tsx",
    family: "bulk paste preview",
  },
];

/**
 * The failed-verdict branch, as text. Everything from `if (!verdict.ok)` to the
 * end of that block, matched by brace depth so a nested `if` cannot end it early.
 */
function failedVerdictBranches(source) {
  const found = [];
  const opener = /if\s*\(\s*!verdict\.ok\s*\)\s*\{/g;
  let hit;
  while ((hit = opener.exec(source)) !== null) {
    let depth = 1;
    let i = hit.index + hit[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    found.push(source.slice(hit.index, i));
  }
  return found;
}

function judge(surface, source) {
  const problems = [];
  const branches = failedVerdictBranches(source);
  if (branches.length === 0) {
    problems.push(
      `${surface.file}: no \`if (!verdict.ok)\` branch found at all. Either this file stopped asking the column, or the guard's list is stale — fix whichever it is rather than deleting the row.`,
    );
    return problems;
  }
  branches.forEach((branch, n) => {
    const where = `${surface.file} (${surface.family}, refusal ${n + 1} of ${branches.length})`;
    if (!branch.includes("columnRuleRefusal")) {
      problems.push(
        `${where}: a refused value is answered without \`columnRuleRefusal()\`. Build the refusal with the primitive and draw it with <FieldRuleRefusal> — one question, one answer.`,
      );
    }
    if (/\btoast\s*\(/.test(branch)) {
      problems.push(
        `${where}: a refusal is shown in a toast. A refusal on a timer is a refusal nobody read, and the value it is about is still on the person's screen. It belongs on the field, until they answer it.`,
      );
    }
  });
  return problems;
}

const root = resolve(new URL("..", import.meta.url).pathname);
const selfTest = process.argv.includes("--self-test");

if (selfTest) {
  const surface = SURFACES[0];
  const real = readFileSync(resolve(root, surface.file), "utf8");
  if (judge(surface, real).length !== 0) {
    console.error("SELF-TEST FAILED: the real bytes are already red.");
    process.exit(1);
  }
  // The pre-fix answer, put back in memory only: the toast, and no primitive.
  const prefix = real.replace(
    /if\s*\(\s*!verdict\.ok\s*\)\s*\{[\s\S]*?\n      \}/,
    `if (!verdict.ok) {
        toast({
          title: \`\${fieldDisplayName}: \${verdict.reason}\`,
          description: "The cell was not saved. Correct it, or press Escape to discard.",
          variant: "destructive",
        });
        return;
      }`,
  );
  const red = judge(surface, prefix);
  if (red.length < 2) {
    console.error(
      `SELF-TEST FAILED: the pre-fix bytes produced ${red.length} complaint(s); the check does not actually catch the defect it exists for.`,
    );
    process.exit(1);
  }
  console.log("SELF-TEST PASSED — the pre-fix toast is caught:");
  for (const line of red) console.log(`  · ${line}`);
  process.exit(0);
}

const problems = SURFACES.flatMap((surface) =>
  judge(surface, readFileSync(resolve(root, surface.file), "utf8")),
);

if (problems.length > 0) {
  console.error("A column's validation refusal is not going through the one primitive:\n");
  for (const line of problems) console.error(`  · ${line}`);
  process.exit(1);
}
console.log(
  `check:validation-refusal-surfaces — ${SURFACES.length} surfaces, every refused value answered through columnRuleRefusal(), no toasts.`,
);
