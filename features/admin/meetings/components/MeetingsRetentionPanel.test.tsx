/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import { MeetingsRetentionPanel } from "./MeetingsRetentionPanel";
import { fetchMeetRetentionPolicies } from "../service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<unknown> | undefined;
const mockFetchMeetRetentionPolicies = jest.mocked(fetchMeetRetentionPolicies);
const retentionRow = {
  id: "policy-1",
  scope: "entity",
  entity_token: "meet_meeting",
  trigger_kind: "untouched",
  mode: "archive",
  retention_days: null,
  warn_days: null,
  legal_hold: false,
  enabled: true,
  label: "Meetings",
  description: null,
  basis: null,
  set_by: "system",
  review_due: null,
  effective_from: "2026-09-29T00:00:00.000Z",
  custody_selector: null,
  updated_at: "2026-09-29T00:00:00.000Z",
};

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<unknown>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock("../service", () => ({
  fetchMeetRetentionPolicies: jest.fn(() => new Promise(() => {})),
}));

describe("MeetingsRetentionPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockFetchMeetRetentionPolicies.mockReturnValue(new Promise(() => {}));
    tableProps = undefined;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the retention rules table on the canonical pagination footer", async () => {
    await act(async () => {
      root.render(<MeetingsRetentionPanel />);
      await Promise.resolve();
    });

    expect(tableProps).toMatchObject({
      tableId: "admin-meetings-retention",
      density: "condensed",
      toolbar: { title: "Rules that govern meeting data" },
      coverage: { noun: "rule", answeredBy: "client" },
    });
    expect(tableProps?.hidePagination).toBeUndefined();
  });

  it("marks a failed policy read as failed so the footer cannot claim an exact empty result", async () => {
    mockFetchMeetRetentionPolicies.mockRejectedValueOnce(new Error("Retention policies unavailable"));

    await act(async () => {
      root.render(<MeetingsRetentionPanel />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tableProps?.data).toEqual([]);
    expect(tableProps?.coverage).toMatchObject({ total: undefined });
    expect(tableProps?.read).toMatchObject({
      status: "error",
      error: "Retention policies unavailable",
      what: "retention rules",
    });
    expect(tableProps?.read?.onRetry).toEqual(expect.any(Function));
  });

  it("keeps prior retention rows visible under the canonical stale-read state after a failed refresh", async () => {
    mockFetchMeetRetentionPolicies
      .mockResolvedValueOnce([retentionRow])
      .mockRejectedValueOnce(new Error("Refresh unavailable"));

    await act(async () => {
      root.render(<MeetingsRetentionPanel />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tableProps?.read?.status).toBe("ready");
    expect(tableProps?.data).toEqual([retentionRow]);

    await act(async () => {
      tableProps?.read?.onRetry?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tableProps?.data).toEqual([retentionRow]);
    expect(tableProps?.read).toMatchObject({
      status: "error",
      error: "Refresh unavailable",
      what: "retention rules",
    });
  });
});
