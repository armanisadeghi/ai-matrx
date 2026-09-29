import type { MathProblemRow } from "./admin-service";
import {
  parseCreateMathProblems,
  parseDeleteMathProblems,
  parseUpdateMathProblems,
} from "./mathProblemAgentWrites";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Existing equation",
  course_name: "Mathematics",
  topic_name: "Algebra",
  module_name: "Foundations",
  description: null,
  intro_text: null,
  final_statement: null,
  hint: null,
  difficulty_level: "easy",
  sort_order: 0,
  is_published: true,
  problem_statement: { text: "Solve", equation: "x=1", instruction: "Find x" },
  solutions: [{ task: "Solve", steps: [], solutionAnswer: "1", transitionText: null }],
  metadata: {}, organization_id: "22222222-2222-4222-8222-222222222222",
  visibility: "public", shown_to: null, resources: null, related_content: null,
  published_to_web: true, published_to_web_at: null, published_to_web_by: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  created_by: null, updated_by: null, deleted_at: null, version: 4,
} satisfies MathProblemRow;

const createValue = {
  title: "New equation", course_name: "Mathematics", topic_name: "Algebra", module_name: "Foundations",
  problem_statement: { text: "Solve", equation: "x + 1 = 2", instruction: "Find x" },
  solutions: [{ task: "Subtract one", steps: [{ title: "Subtract", equation: "x = 1" }], solutionAnswer: "x = 1" }],
};

describe("Quick Math agent write parsers", () => {
  it("creates unpublished internal drafts", () => {
    const [created] = parseCreateMathProblems([createValue], [row]);
    expect(created.is_published).toBe(false);
    expect(created.published_to_web).toBe(false);
    expect(created.title).toBe("New equation");
  });

  it("refuses publishing fields and duplicate existing names before approval", () => {
    expect(() => parseCreateMathProblems([{ ...createValue, title: row.title, is_published: true }], [row]))
      .toThrow(/does not accept is_published/);
  });

  it("requires the loaded row version for updates and preserves publication control", () => {
    const [plan] = parseUpdateMathProblems([{ id: row.id, version: 4, title: "Renamed equation" }], [row]);
    expect(plan.version).toBe(4);
    expect(plan.patch).toEqual({ title: "Renamed equation" });
    expect(() => parseUpdateMathProblems([{ id: row.id, version: 3, title: "Stale" }], [row]))
      .toThrow(/version must match/);
    expect(() => parseUpdateMathProblems([{ id: row.id, version: 4, is_published: false }], [row]))
      .toThrow(/does not accept is_published/);
  });

  it("refuses unknown ids and duplicate deletes", () => {
    expect(() => parseDeleteMathProblems([{ id: "missing", version: 4 }], [row])).toThrow(/unknown or unavailable/);
    expect(() => parseDeleteMathProblems([{ id: row.id, version: 3 }], [row])).toThrow(/version must match/);
    expect(() => parseDeleteMathProblems([{ id: row.id, version: 4 }, { id: row.id, version: 4 }], [row])).toThrow(/same id more than once/);
  });
});
