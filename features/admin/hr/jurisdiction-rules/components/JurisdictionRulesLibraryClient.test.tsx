/** @jest-environment jsdom */

import { act, isValidElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";

import type { JurisdictionRule } from "../types";
import { JurisdictionRulesLibraryClient } from "./JurisdictionRulesLibraryClient";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<JurisdictionRule> | null = null;
const reload = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<JurisdictionRule>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams("rule=rule-1"),
}));

jest.mock("@/lib/deployment/navigate", () => ({
  pushAppHref: jest.fn(),
}));

const { pushAppHref: mockPushAppHref } = jest.requireMock<{
  pushAppHref: jest.Mock;
}>("@/lib/deployment/navigate");

const rules: JurisdictionRule[] = [
  {
    id: "rule-1",
    rule_class: "pto-payout",
    rule_class_label: "PTO payout",
    produces_money: true,
    jurisdiction_key: "US-CA",
    jurisdiction_name: "California",
    jurisdiction_level: "state",
    effective_from: "2026-01-01",
    effective_to: null,
    status: "active",
    basis: "California Labor Code",
    citation: null,
    verification_due: "2026-10-01",
    version: 3,
    source_scope: null,
    organization_id: null,
    applicability: null,
    parameters: null,
    unverified_keys: ["excludes"],
    jur_seed_task: "JUR-SEED-CA-PTO-PAYOUT",
    status_history: [],
    supersedes_id: null,
    correction_of_id: null,
    fixtures: [],
  },
];

jest.mock("../useJurisdictionRulesAdminData", () => ({
  useJurisdictionRulesAdminData: () => ({
    loading: false,
    reload,
    load: {
      state: "ok",
      data: { rules, classes: [], seedProgress: [], overdue: [] },
    },
  }),
}));

describe("JurisdictionRulesLibraryClient", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    mockPushAppHref.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps every library field, class grouping, deep-link highlighting, and canonical navigation", () => {
    act(() => root.render(<JurisdictionRulesLibraryClient />));

    if (!tableProps) throw new Error("Library table did not render");
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "rule_class_label",
      "jurisdiction",
      "status",
      "effective",
      "version",
      "citation",
      "jur_seed_task",
      "fixtures",
    ]);
    expect(tableProps.columns[0].hidden).toBe(true);
    expect(tableProps.grouping?.columnId).toBe("rule_class_label");
    expect(tableProps.pageSize).toBe(0);
    expect(tableProps.toolbar?.refresh?.onRefresh).toBe(reload);
    expect(tableProps.detail).toEqual({ enabled: false });
    expect(tableProps.getRowHref?.(rules[0])).toBe(
      "/administration/hr/jurisdiction-rules/rule-1",
    );

    const wrapped = tableProps.rowWrapper?.(
      rules[0],
      <tr className="table-row" />,
    );
    if (!isValidElement<{ id?: string; className?: string }>(wrapped)) {
      throw new Error("Deep-link row wrapper did not render");
    }
    expect(wrapped.props.id).toBe("rule-1");
    expect(wrapped.props.className).toContain("ring-primary/40");

    tableProps.onRowOpen?.(rules[0]);
    expect(mockPushAppHref).toHaveBeenCalledWith(
      expect.anything(),
      "/administration/hr/jurisdiction-rules/rule-1",
    );
  });
});
