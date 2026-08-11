import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const DETECTOR = join(dirname(fileURLToPath(import.meta.url)), "detect-light-dark.mjs");

function runFixture(source, approved = []) {
  const root = mkdtempSync(join(tmpdir(), "p4-detector-"));
  const ledgerDir = join(root, ".claude/skills/light-dark-integrity");
  mkdirSync(ledgerDir, { recursive: true });
  writeFileSync(
    join(ledgerDir, "exceptions.json"),
    JSON.stringify({ version: 1, approved }),
  );
  writeFileSync(join(root, "sample.tsx"), source);

  try {
    return JSON.parse(
      execFileSync(process.execPath, [DETECTOR, "--json", "sample.tsx"], {
        cwd: root,
        encoding: "utf8",
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("pairs raw colors only with the same property and state variants", () => {
  const result = runFixture(`
<div className="text-black dark:bg-zinc-900" />
<div className="hover:bg-white/10 dark:hover:text-white" />
<div className="text-black dark:text-white" />
<div className="dark:text-black" />
<div className="[&>button]:bg-white dark:[&>button]:bg-zinc-800" />
<div className="text-white dark:text-black" />
`);

  assert.equal(result.summary.matchingLines, 6);
  assert.equal(result.summary.sameLinePaired, 3);
  assert.equal(result.summary.reviewCandidates, 3);
  assert.deepEqual(result.matches[0].unpairedTokens, ["text-black"]);
  assert.deepEqual(result.matches[1].unpairedTokens, ["hover:bg-white/10"]);
  assert.deepEqual(result.matches[3].unpairedTokens, ["dark:text-black"]);
});

test("one approval applies only to its exact candidate line", () => {
  const result = runFixture(
    `{/* patrol-exception:P4-EX-001 */}\n<div className="hover:bg-white/10" />\n<div className="hover:bg-white/10" />\n`,
    [
      {
        id: "P4-EX-001",
        file: "sample.tsx",
        line: 2,
        tokens: ["hover:bg-white/10"],
        reason: "Arman approved fixed overlay chrome.",
        reviewUrl: "https://aimatrx.com/review",
        approvedBy: "Arman",
        approvedOn: "2026-08-11",
        approvalReference: "agent-review:test",
      },
    ],
  );

  assert.equal(result.summary.approvedExceptions, 1);
  assert.equal(result.summary.reviewCandidates, 1);
  assert.equal(result.summary.invalidExceptions, 0);
  assert.equal(result.matches[0].status, "approved_exception");
  assert.equal(result.matches[1].status, "needs_review");
});

test("duplicate annotations are loud and never approve", () => {
  const result = runFixture(
    `{/* patrol-exception:P4-EX-001 */}\n{/* patrol-exception:P4-EX-001 */}\n<div className="bg-white" />\n`,
    [
      {
        id: "P4-EX-001",
        file: "sample.tsx",
        line: 3,
        tokens: ["bg-white"],
        reason: "Arman approved a fixed document matte.",
        reviewUrl: "https://aimatrx.com/review",
        approvedBy: "Arman",
        approvedOn: "2026-08-11",
        approvalReference: "agent-review:test",
      },
    ],
  );

  assert.equal(result.summary.approvedExceptions, 0);
  assert.ok(result.summary.invalidExceptions > 0);
  assert.equal(result.matches[0].status, "invalid_exception");
});

test("duplicate ledger ids are loud and never approve", () => {
  const approved = {
    id: "P4-EX-001",
    file: "sample.tsx",
    line: 2,
    tokens: ["bg-white"],
    reason: "Arman approved a fixed document matte.",
    reviewUrl: "https://aimatrx.com/review",
    approvedBy: "Arman",
    approvedOn: "2026-08-11",
    approvalReference: "agent-review:test",
  };
  const result = runFixture(
    `{/* patrol-exception:P4-EX-001 */}\n<div className="bg-white" />\n`,
    [approved, { ...approved, reason: "Duplicate must invalidate both entries." }],
  );

  assert.equal(result.summary.approvedExceptions, 0);
  assert.ok(result.summary.invalidExceptions > 0);
  assert.equal(result.matches[0].status, "needs_review");
});
