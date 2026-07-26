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

const DEFAULT_FIXTURES_DIR = path.resolve(
  __dirname,
  "../../../../../..",
  "..",
  "common-docs/systems/model-config",
);

const FIXTURE_PATH = path.join(
  process.env.MATRX_SHARED_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR,
  "constraint-eval-fixture.json",
);

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
