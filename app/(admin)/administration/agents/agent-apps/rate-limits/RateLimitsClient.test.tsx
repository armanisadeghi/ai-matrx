/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import { RateLimitsClient } from "./RateLimitsClient";
import type { AgentAppRateLimitRow } from "@/lib/services/agent-apps-admin-service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<AgentAppRateLimitRow> | null = null;
const load = jest.fn();
const unblock = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<AgentAppRateLimitRow>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/lib/services/agent-apps-admin-service", () => ({
  fetchAgentAppRateLimits: (...args: unknown[]) => load(...args),
  unblockAgentAppRateLimit: (...args: unknown[]) => unblock(...args),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/components/loaders/MatrxMiniLoader", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: () => Promise.resolve(true),
}));

const row: AgentAppRateLimitRow = {
  id: "limit-1",
  app_id: "app-1",
  user_id: "user-1",
  fingerprint: null,
  ip_address: null,
  execution_count: 12,
  first_execution_at: "2026-09-21T00:00:00.000Z",
  last_execution_at: "2026-09-21T01:00:00.000Z",
  window_start_at: "2026-09-21T00:00:00.000Z",
  is_blocked: true,
  blocked_until: null,
  blocked_reason: "Burst protection",
  created_at: "2026-09-21T00:00:00.000Z",
  updated_at: "2026-09-21T01:00:00.000Z",
  app_name: "Budget analyst",
  app_slug: "budget-analyst",
};

describe("RateLimitsClient canonical table contract", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    load.mockResolvedValue([row]);
    unblock.mockResolvedValue(row);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses canonical query, coverage, source status, copy/export, and retained unblock action", async () => {
    await act(async () => {
      root.render(<RateLimitsClient />);
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    if (!tableProps) throw new Error("Rate limits table was not rendered");
    expect(load).toHaveBeenCalledWith({ is_blocked: true, limit: 500 });
    expect(tableProps.query).toMatchObject({
      mode: "controlled-local",
      state: { sort: { id: "last_execution_at", direction: "desc" } },
    });
    expect(tableProps.coverage).toEqual({ noun: "rate limit", cap: 500, answeredBy: "client" });
    expect(tableProps.toolbar?.facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "source-status", value: "blocked" }),
    ]));
    const copy = tableProps.copy;
    if (!copy || !copy.export) throw new Error("Rate limit copy/export was not configured");
    expect(copy.export([row], [row]).items).toHaveLength(2);
    expect(tableProps.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "app", filter: "text", frozen: true }),
      expect.objectContaining({ id: "identifier", filter: "text" }),
      expect.objectContaining({ id: "identifier_type", filter: "select", hidden: true }),
      expect.objectContaining({ accessorKey: "execution_count", filter: "number" }),
    ]));

    await act(async () => {
      const action = tableProps?.rowActions?.(row, {} as never);
      if (!action || typeof action !== "object" || !("props" in action)) {
        throw new Error("Blocked rate limit action was not rendered");
      }
      await (action.props as { onClick: () => Promise<void> }).onClick();
    });
    expect(unblock).toHaveBeenCalledWith(row.id);
  });
});
