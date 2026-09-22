import { getCellValue } from "@ai-matrx/design-system/data-table/filter-engine";
import type { AgentAppAdminView } from "@/lib/services/agent-apps-admin-service";
import {
  AGENT_APP_COLUMNS,
  AGENT_APPS_COVERAGE,
  agentAppSuccessPercent,
  agentAppsScopeFilters,
} from "./page";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

function column(id: string) {
  const found = AGENT_APP_COLUMNS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing ${id} column`);
  return found;
}

describe("Agent Apps canonical table contract", () => {
  it("discloses the latest-1000 client-side window", () => {
    expect(AGENT_APPS_COVERAGE).toEqual({
      noun: "agent app",
      cap: 1000,
      answeredBy: "client",
    });
  });

  it("keeps the existing independent filters and metrics as table accessors", () => {
    for (const id of [
      "name",
      "id",
      "slug",
      "mandate",
      "status",
      "category",
      "creator",
      "featured",
      "verified",
      "executions",
      "users",
      "success-rate",
      "cost",
      "updated",
      "description",
      "tags",
      "visibility",
    ])
      expect(column(id).filter).not.toBe(false);
    expect(column("description").hidden).toBe(true);
    expect(column("tags").hidden).toBe(true);
  });

  it("filters success in displayed percent units without turning no signal into zero", () => {
    expect(agentAppSuccessPercent(0.5)).toBe(50);
    expect(agentAppSuccessPercent(0)).toBe(0);
    expect(agentAppSuccessPercent(null)).toBeNull();
  });

  it("maps the canonical query into truthful surface filter and sort metadata", () => {
    const query: MatrxDataTableQueryState = {
      page: 1,
      pageSize: 50,
      search: "invoices",
      anyOf: "",
      sort: { id: "success-rate", direction: "asc" },
      columnFilters: {
        name: { kind: "text", value: "invoice app" },
        slug: { kind: "text", value: "billing" },
        status: { kind: "select", value: "published", values: ["published"] },
        category: { kind: "select", value: "finance", values: ["finance"] },
        featured: { kind: "boolean", value: true },
        verified: { kind: "boolean", value: false },
        creator: { kind: "text", value: "admin@" },
      },
    };
    expect(agentAppsScopeFilters(query)).toEqual({
      name: "invoice app",
      slug: "billing",
      status: ["published"],
      category: ["finance"],
      featured: "featured",
      verified: "not-verified",
      creator: "admin@",
    });
  });
  it("keeps missing metrics distinct from measured zero", () => {
    const app: AgentAppAdminView = {
      id: "app-test", created_by: null, agent_id: "agent-test",
      mandate_id: null, mandate_key: null, slug: "test", name: "Test",
      tags: [], status: "draft", visibility: "private",
      is_verified: false, is_featured: false, rate_limit_per_ip: null,
      rate_limit_window_hours: null, rate_limit_authenticated: null,
      total_executions: null, unique_users_count: null, success_rate: null,
      total_tokens_used: null, total_cost: null,
      created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z",
    };
    for (const id of ["executions", "users", "cost"]) {
      expect(getCellValue(app, column(id))).toBeNull();
      expect(getCellValue({ ...app, total_executions: 0, unique_users_count: 0, total_cost: 0 }, column(id))).toBe(0);
    }
  });

});
