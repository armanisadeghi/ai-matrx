import type { AgentAppAdminView } from "@/lib/services/agent-apps-admin-service";
import {
  ANALYTICS_COLUMNS,
  ANALYTICS_COVERAGE,
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
} as AgentAppAdminView;

describe("Agent-app analytics canonical table contract", () => {
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
});
