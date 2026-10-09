import type { AppletAdminView } from "@/lib/services/applets-admin-service";
import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillLevelProblems,
  emptyDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import {
  ANALYTICS_COLUMNS,
  ANALYTICS_COVERAGE,
  ANALYTICS_DRILL,
  analyticsSlugDisplay,
} from "./page";

const app = {
  id: "app-id",
  name: "Analytics app",
  slug: "analytics-app",
  status: "published",
  category: null,
  total_executions: null,
  unique_users_count: null,
  success_rate: null,
  avg_execution_time_ms: null,
  total_tokens_used: null,
  total_cost: null,
  last_execution_at: null,
  is_featured: false,
  is_verified: false,
} as AppletAdminView;

describe("Applet analytics canonical table contract", () => {
  it("keeps every metric independently sortable and filterable without treating unknown as zero", () => {
    expect(ANALYTICS_COVERAGE).toEqual({ noun: "app", answeredBy: "client" });
    expect(ANALYTICS_COLUMNS.map((column) => column.id)).toEqual(
      expect.arrayContaining([
        "name",
        "slug",
        "status",
        "category",
        "executions",
        "unique-users",
        "success-rate",
        "avg-execution-time",
        "cost",
        "tokens",
        "last-execution",
        "featured",
        "verified",
        "active",
      ]),
    );
    for (const id of [
      "executions",
      "unique-users",
      "success-rate",
      "avg-execution-time",
      "cost",
      "tokens",
    ]) {
      expect(ANALYTICS_COLUMNS.find((column) => column.id === id)?.filter).toBe(
        "number",
      );
    }
    expect(
      ANALYTICS_COLUMNS.find((column) => column.id === "success-rate")?.accessorFn?.(app),
    ).toBeNull();
  });

  it("keeps a textual slug readable and shortens UUID fallback values", () => {
    expect(analyticsSlugDisplay("analytics-app")).toBe("analytics-app");
    expect(analyticsSlugDisplay("99820f36-a939-4ae3-b5e8-15f1107bef86")).toBe(
      "99820f36",
    );
  });

  describe("drill levels", () => {
    const { local: _local, ...options } = ANALYTICS_DRILL;
    const apps = [
      { ...app, id: "1", category: "research", status: "published", total_executions: 10, total_tokens_used: 100, total_cost: 0.5, last_execution_at: "2026-07-01T10:00:00Z" },
      { ...app, id: "2", category: "research", status: "draft", total_executions: 5, total_tokens_used: 50, total_cost: 0.25, last_execution_at: null },
      { ...app, id: "3", category: "legal", status: "published", total_executions: 7, total_tokens_used: null, total_cost: null, last_execution_at: "2026-08-02T10:00:00Z" },
    ] as AppletAdminView[];
    const config = drillConfigFromColumns(ANALYTICS_COLUMNS, apps, options);

    it("declares only levels its Dimensions and Measures can honour", () => {
      expect(drillLevelProblems(config.dimensions, config.measures, { attributeKeys: [] })).toEqual([]);
    });

    it("a category's numbers add up to the apps in it (unknown cost adds nothing)", () => {
      const question = { ...emptyDrillQuestion(["count", "sum_executions", "sum_tokens"]), by: ["category"] };
      const groups = (drillAnswerLocally(apps, question, config).category ?? []) as unknown as {
        groups: { category: string };
        measures: Record<string, number>;
      }[];
      const research = groups.find((g) => g.groups.category === "research")!;
      expect(research.measures).toMatchObject({ count: 2, sum_executions: 15, sum_tokens: 150 });
      const legal = groups.find((g) => g.groups.category === "legal")!;
      expect(legal.measures).toMatchObject({ count: 1, sum_executions: 7 });
    });
  });
});
