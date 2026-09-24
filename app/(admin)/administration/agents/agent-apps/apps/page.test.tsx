import { getCellValue } from "@ai-matrx/design-system/data-table/filter-engine";
import type { AgentAppAdminView } from "@/lib/services/agent-apps-admin-service";
import {
  AGENT_APP_COLUMNS,
  agentAppsCopyConfig,
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
  it("uses one canonical Alchemy configuration while retaining the custom view exports", () => {
    const app: AgentAppAdminView = {
      id: "app-test",
      created_by: null,
      agent_id: "agent-test",
      mandate_id: null,
      mandate_key: null,
      slug: "test",
      name: "Test",
      tags: [],
      status: "draft",
      visibility: "private",
      is_verified: false,
      is_featured: false,
      rate_limit_per_ip: null,
      rate_limit_window_hours: null,
      rate_limit_authenticated: null,
      total_executions: null,
      unique_users_count: null,
      success_rate: null,
      total_tokens_used: null,
      total_cost: null,
      created_at: "2026-09-22T00:00:00Z",
      updated_at: "2026-09-22T00:00:00Z",
    };
    const allApp = { ...app, id: "app-all", name: "All app" };
    const copy = agentAppsCopyConfig();
    const visibleNow = [{ ...app, id: "app-visible-now", name: "Visible now" }];
    const allNow = [...visibleNow, allApp];
    expect(copy.showToolbar).not.toBe(false);
    expect(copy.showRow).not.toBe(false);
    expect(copy.listAttributes?.(visibleNow, allNow)).toEqual({
      count: 1,
      totalCount: 2,
    });

    const brief = copy.aiVariants?.(visibleNow, allNow)[0];
    expect(brief?.id).toBe("briefs");
    expect(brief?.build?.()).toEqual(
      expect.objectContaining({ data: [expect.stringContaining("Visible now")] }),
    );

    const exports = copy.export?.(visibleNow, allNow).items;
    if (!exports) throw new Error("Agent apps exports were not configured");
    expect(exports).toHaveLength(2);
    expect(String(exports[0]?.build?.().content)).toContain("app-visible-now");
    expect(String(exports[1]?.build?.().content)).toContain("app-visible-now");

    const custom = copy.aiCustom?.(visibleNow, allNow);
    if (!custom) throw new Error("Agent apps custom export was not configured");
    expect(
      custom.build({
        onlyFiltered: true,
        includeDescription: false,
      }),
    ).toEqual(expect.objectContaining({
      text: expect.stringContaining("Visible now"),
      meta: { apps: 1 },
    }));
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
