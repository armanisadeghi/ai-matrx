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
        slug: { kind: "text", value: "billing" },
        status: { kind: "select", value: "published", values: ["published"] },
        category: { kind: "select", value: "finance", values: ["finance"] },
        featured: { kind: "boolean", value: true },
        verified: { kind: "boolean", value: false },
        creator: { kind: "text", value: "admin@" },
      },
    };
    expect(agentAppsScopeFilters(query)).toEqual({
      name: "invoices",
      slug: "billing",
      status: ["published"],
      category: ["finance"],
      featured: "featured",
      verified: "not-verified",
      creator: "admin@",
    });
  });
});
