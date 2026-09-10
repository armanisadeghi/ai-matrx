/**
 * Cross-CI contract test: `evaluateAllConstraints` must reproduce the shared
 * fixture exactly. The same fixture is run against the Python port in aidream
 * (packages/matrx-ai/matrx_ai/catalog/constraint_eval.py + its
 * test_constraint_eval_fixture.py) — this evaluator is the spec, the fixture
 * is the wire contract. The fixture lives in the common-docs repo; override
 * its directory with MATRX_SHARED_FIXTURES_DIR.
 */

import * as fs from "fs";
import * as path from "path";

import { evaluateAllConstraints } from "../constraints";
import type { ModelConstraint } from "@/features/ai-models/types";

// common-docs is a SIBLING repo checked out beside this one. The fixture moved
// from `systems/model-config/` to `systems/agents/ai-models/` in the common-docs
// docs rename cascade (6bb0b8aa).
const DEFAULT_FIXTURES_DIR = path.resolve(
  __dirname,
  "../../../../../..",
  "..",
  "common-docs/systems/agents/ai-models",
);

const FIXTURES_DIR =
  process.env.MATRX_SHARED_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR;
const FIXTURE_PATH = path.join(FIXTURES_DIR, "constraint-eval-fixture.json");

if (!fs.existsSync(FIXTURE_PATH)) {
  // NEVER downgrade this to a skip. A missing cross-repo fixture means the
  // evaluator contract is UNMEASURED on both sides, not that it passes.
  throw new Error(
    [
      `UNMEASURED: the shared constraint-evaluator contract fixture is missing at ${FIXTURE_PATH}.`,
      "This suite is the only thing proving evaluateAllConstraints still matches the Python port",
      "(aidream packages/matrx-ai/matrx_ai/catalog/constraint_eval.py), so a missing fixture is a",
      "RED contract, never a pass.",
      "Remedy: clone/refresh the sibling common-docs repo beside this one so",
      "common-docs/systems/agents/ai-models/constraint-eval-fixture.json exists, or point",
      "MATRX_SHARED_FIXTURES_DIR at the directory that holds it. If the fixture was intentionally",
      "moved again, update DEFAULT_FIXTURES_DIR here AND the aidream test that reads the same file.",
    ].join(" "),
  );
}

interface ExpectedIssue {
  ruleId: string;
  key: string;
  severity: string;
  category: string;
  message: string;
}

interface FixtureCase {
  name: string;
  constraints: ModelConstraint[];
  config: Record<string, unknown>;
  expected_issues: ExpectedIssue[];
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8")) as {
  cases: FixtureCase[];
};

describe("constraint evaluator — shared cross-CI fixture", () => {
  it("has minimum coverage", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(25);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "%s",
    (_name, testCase) => {
      const issues = evaluateAllConstraints(
        testCase.constraints,
        testCase.config,
      );

      const actual: ExpectedIssue[] = issues.map((issue) => ({
        ruleId: issue.ruleId,
        key: issue.key,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
      }));

      const expected: ExpectedIssue[] = testCase.expected_issues.map((e) => ({
        ruleId: e.ruleId,
        key: e.key,
        severity: e.severity,
        category: e.category,
        message: e.message,
      }));

      expect(actual).toEqual(expected);
    },
  );
});
