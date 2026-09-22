import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
import type {
  AgentAppErrorRow,
  AgentAppExecutionRow,
} from "@/lib/services/agent-apps-admin-service";
import {
  ERRORS_COVERAGE,
  ERROR_COLUMNS,
  errorColumns,
  errorResolvedFilter,
  errorTypeFilterOptions,
  errorSourceFilters,
  executionSourceFilters,
  humanExecution,
  scopedAppId,
  EXECUTIONS_COVERAGE,
  EXECUTION_COLUMNS,
  executionSuccessFilter,
} from "./page";

const query = (
  columnFilters: MatrxDataTableQueryState["columnFilters"],
): MatrxDataTableQueryState => ({
  page: 1,
  pageSize: 50,
  search: "",
  anyOf: "",
  columnFilters,
  sort: { id: "created", direction: "desc" },
});
const execution = {
  id: "execution-id",
  app_id: "app-id",
  task_id: "task-id",
  variables_provided: {},
  variables_used: {},
  success: false,
  execution_time_ms: null,
  tokens_used: null,
  cost: null,
  metadata: {},
  created_at: "2026-09-22T00:00:00.000Z",
  app_name: "Fact checker",
  app_slug: "fact-checker",
} as AgentAppExecutionRow;
const error = {
  id: "error-id",
  app_id: "app-id",
  error_type: "api_error",
  error_details: {},
  variables_sent: {},
  expected_variables: {},
  resolved: false,
  created_at: "2026-09-22T00:00:00.000Z",
  app_name: "Fact checker",
  app_slug: "fact-checker",
} as AgentAppErrorRow;

describe("Agent-app execution canonical table contract", () => {
  it("keeps independent filterable accessors, nullable metrics, and capped coverage", () => {
    expect(EXECUTIONS_COVERAGE).toEqual({
      noun: "execution",
      cap: 500,
      answeredBy: "client",
    });
    expect(ERRORS_COVERAGE).toEqual({
      noun: "error",
      cap: 500,
      answeredBy: "client",
    });
    expect(EXECUTION_COLUMNS.map((column) => column.id)).toEqual(
      expect.arrayContaining([
        "success",
        "kind",
        "app",
        "app-id",
        "app-slug",
        "id",
        "task",
        "user-id",
        "fingerprint",
        "ip-address",
        "tokens",
        "cost",
        "duration",
        "created",
      ]),
    );
    expect(ERROR_COLUMNS.map((column) => column.id)).toEqual(
      expect.arrayContaining([
        "resolved",
        "type",
        "app",
        "id",
        "message",
        "code",
        "execution",
        "created",
      ]),
    );
    expect(
      EXECUTION_COLUMNS.find((column) => column.id === "tokens")?.accessorFn?.(
        execution,
      ),
    ).toBeNull();
    expect(
      EXECUTION_COLUMNS.find(
        (column) => column.id === "duration",
      )?.accessorFn?.(execution),
    ).toBeNull();
    expect(
      ERROR_COLUMNS.find((column) => column.id === "app")?.accessorFn?.(error),
    ).toBe("Fact checker");
  });

  it("maps canonical boolean filters to the retained source filters", () => {
    expect(executionSuccessFilter(query({}))).toBe("all");
    expect(
      executionSuccessFilter(
        query({ success: { kind: "boolean", value: true } }),
      ),
    ).toBe("success");
    expect(
      executionSuccessFilter(
        query({ success: { kind: "boolean", value: false } }),
      ),
    ).toBe("failed");
    expect(errorResolvedFilter(query({}))).toBe("all");
    expect(
      errorResolvedFilter(
        query({ resolved: { kind: "boolean", value: true } }),
      ),
    ).toBe("resolved");
    expect(
      errorResolvedFilter(
        query({ resolved: { kind: "boolean", value: false } }),
      ),
    ).toBe("unresolved");
  });
});
