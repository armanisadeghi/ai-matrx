/** @jest-environment jsdom */

import { act, isValidElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";

import {
  CA_PTO_PAYOUT_SEED_TASK,
  type JurisdictionRuleOverdue,
  type JurSeedProgress,
} from "../types";
import { JurisdictionVerificationClient } from "./JurisdictionVerificationClient";

type TableRow = JurSeedProgress | JurisdictionRuleOverdue;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tables: MatrxDataTableProps<TableRow>[] = [];
const reload = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<TableRow>) => {
    tables.push(props);
    return null;
  },
}));

const seedProgress: JurSeedProgress[] = [
  {
    jur_seed_task: CA_PTO_PAYOUT_SEED_TASK,
    rows_total: 2,
    rows_active: 1,
    rows_advisory: 1,
    rows_draft: 0,
    rows_with_unverified_keys: 1,
    rows_overdue: 1,
    next_verification_due: "2026-10-01",
    task_complete: false,
  },
];

const overdue: JurisdictionRuleOverdue[] = [
  {
    rule_id: "rule-1",
    rule_version: 2,
    rule_class: "pto-payout",
    rule_class_label: "PTO payout",
    jurisdiction_key: "US-CA",
    jurisdiction_name: "California",
    status: "active",
    jur_seed_task: CA_PTO_PAYOUT_SEED_TASK,
    verification_due: "2026-09-01",
    days_overdue: 22,
    basis: null,
    citation: {
      authority: "California Labor Code",
      title: null,
      url: "https://leginfo.legislature.ca.gov",
      retrieved_at: null,
      verified_by: null,
      verified_at: null,
      confidence: null,
    },
    organization_id: null,
  },
];

jest.mock("../useJurisdictionRulesAdminData", () => ({
  useJurisdictionRulesAdminData: () => ({
    loading: false,
    reload,
    load: {
      state: "ok",
      data: { seedProgress, overdue, classes: [], rules: [] },
    },
  }),
}));

describe("JurisdictionVerificationClient", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tables = [];
    reload.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the nine seed fields, seven overdue fields, anchors, links, and refresh contract", () => {
    act(() => root.render(<JurisdictionVerificationClient />));

    const seedTable = tables.find(
      (table) => table.urlState?.id === "jurisdiction-seed-progress",
    );
    const overdueTable = tables.find(
      (table) => table.urlState?.id === "jurisdiction-overdue-rules",
    );
    if (!seedTable || !overdueTable)
      throw new Error("Verification tables did not render");

    expect(seedTable.columns.map((column) => column.id)).toEqual([
      "jur_seed_task",
      "rows_total",
      "rows_active",
      "rows_advisory",
      "rows_draft",
      "rows_with_unverified_keys",
      "rows_overdue",
      "next_verification_due",
      "task_complete",
    ]);
    expect(overdueTable.columns.map((column) => column.id)).toEqual([
      "rule_class_label",
      "jurisdiction",
      "status",
      "verification_due",
      "days_overdue",
      "jur_seed_task",
      "citation",
    ]);
    expect(seedTable.density).toBe("condensed");
    expect(seedTable.pageSize).toBe(25);
    expect(seedTable.toolbar?.refresh?.onRefresh).toBe(reload);
    expect(overdueTable.toolbar?.refresh?.onRefresh).toBe(reload);
    expect(seedTable.detail).toEqual({ enabled: false });
    expect(overdueTable.detail).toEqual({ enabled: false });

    const wrapped = seedTable.rowWrapper?.(
      seedProgress[0] as TableRow,
      <tr className="table-row" />,
    );
    if (!isValidElement<{ id?: string; className?: string }>(wrapped)) {
      throw new Error("Seed row wrapper did not render a row");
    }
    expect(wrapped.props.id).toBe(CA_PTO_PAYOUT_SEED_TASK);
    expect(wrapped.props.className).toContain("scroll-mt-16");

    const classCell = overdueTable.columns[0].cell?.(overdue[0] as TableRow, 0);
    if (!isValidElement<{ href?: string }>(classCell)) {
      throw new Error("Rule class did not render a link");
    }
    expect(classCell.props.href).toBe(
      "/administration/hr/jurisdiction-rules/rule-1",
    );
    expect(host.textContent).toContain(
      "California PTO payout amounts are withheld",
    );
  });
});
