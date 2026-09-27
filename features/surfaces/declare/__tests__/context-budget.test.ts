import { agentHintsExtension } from "../surface-declare";
import { PAGE_CONTEXT_BUDGET } from "@/features/surfaces/types";

type DeclaredManifest = Parameters<NonNullable<typeof agentHintsExtension.validate>>[0];

const manifest = (inline: number[], approval?: string) =>
  ({
    surfaceName: "matrx-user/budget-demo",
    ...(approval ? { contextBudgetApproval: approval } : {}),
    values: inline.map((n, i) => ({
      name: `v${i}`,
      label: `V${i}`,
      description: "demo",
      valueType: "string",
      alwaysAvailable: false,
      inlineUpTo: n,
    })),
  }) as unknown as DeclaredManifest;

const budgetIssues = (m: DeclaredManifest, inheritedInline: number[] = []) =>
  (agentHintsExtension.validate?.(m, {
    all: [
      {
        surfaceName: m.surfaceName,
        values: [...m.values, ...manifest(inheritedInline).values],
      },
    ],
  } as unknown as Parameters<NonNullable<typeof agentHintsExtension.validate>>[1]) ?? []).filter(
    (i) => i.path === "values/inlineUpTo",
  );

describe("the page context budget", () => {
  it("accepts a page whose up-front context fits the budget", () => {
    expect(budgetIssues(manifest([7000, 1500, 1500]))).toHaveLength(0);
  });

  it("refuses a page whose values together exceed the budget", () => {
    const issues = budgetIssues(manifest([10_000, 10_000, 10_000]));
    expect(issues).toHaveLength(1);
    expect(issues[0].sentence).toContain(`${PAGE_CONTEXT_BUDGET}`);
  });

  it("counts values inherited from a parent surface", () => {
    expect(budgetIssues(manifest([7000]), [4000])).toHaveLength(1);
  });

  it("allows the excess only with Arman's recorded approval", () => {
    expect(budgetIssues(manifest([10_000, 4000], "Arman 2026-09-27: test"))).toHaveLength(0);
  });
});
