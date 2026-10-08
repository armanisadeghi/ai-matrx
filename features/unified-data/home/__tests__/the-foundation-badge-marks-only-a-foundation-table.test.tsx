/**
 * THE FOUNDATION BADGE IS ON A FOUNDATION TABLE'S OWN ROW, AND NOWHERE ELSE (lane 10 FD).
 *
 * 1. The cards view and the rows view draw the badge exactly on the rows that are Foundation — the
 *    table view is covered by the-data-home-lists-foundation-tables-first.
 * 2. The mark is read off the Tables listing's OWN row for that table. A form, a dashboard or a
 *    booking page built ON Cedar Ridge's Patients table is not day-one data and carries no mark.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RecordsClient } from "@ai-matrx/records/core";
import type { RecordsDataSource } from "@ai-matrx/records";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});

// eslint-disable-next-line import/first
import { TooltipProvider } from "@/components/ui/tooltip";
// eslint-disable-next-line import/first
import { DataHomeCards, DataHomeRows } from "../DataHomeViews";
// eslint-disable-next-line import/first
import { buildDataHomeRows } from "../dataHomeRows";
// eslint-disable-next-line import/first
import type { HubCapability, HubItem } from "@/features/unified-data/hub/capabilities";
// eslint-disable-next-line import/first
import type { DataHomeAnswer } from "@/features/unified-data/hub/doors";
// eslint-disable-next-line import/first
import { row } from "./fixtures";

const ROWS = [
  row({ name: "Patients", foundation: true }),
  row({ name: "Therapists", foundation: true }),
  row({ name: "Visit Notes", foundation: false }),
  row({ name: "Patient Intake", kind: "form", parentName: "Patients", foundation: false }),
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const props = {
  rows: ROWS,
  density: "compact" as const,
  showShared: true,
  hrefFor: (r: (typeof ROWS)[number]) => r.href,
  actions: { menuFor: () => () => ({ sections: [] }) } as never,
  isStarred: () => false,
  onOpened: () => undefined,
};

/** The names of the rows (cards) whose own element carries the badge. */
function badged(rowSelector: string): string[] {
  return [...host.querySelectorAll(rowSelector)]
    .filter((el) => el.querySelector("[data-data-home-foundation]"))
    .map((el) => ROWS.find((r) => r.id === el.getAttribute("data-row-id"))?.name ?? "?")
    .sort();
}

describe("the Foundation badge in the cards and rows views", () => {
  it("cards: on exactly the foundation tables", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <DataHomeCards {...props} />
        </TooltipProvider>,
      );
    });
    expect(badged("[data-row-id]")).toEqual(["Patients", "Therapists"]);
  });

  it("rows: on exactly the foundation tables", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <DataHomeRows {...props} />
        </TooltipProvider>,
      );
    });
    expect(badged("li[data-row-id]")).toEqual(["Patients", "Therapists"]);
  });
});

describe("the mark is the table's own, never a thing built on it", () => {
  const CLINIC = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
  const PATIENTS = "8d418147-0001-4542-be85-79bd21c633a1";
  const item = (patch: Partial<HubItem>): HubItem => ({
    id: PATIENTS,
    title: "Patients",
    tableId: PATIENTS,
    tableName: "Patients",
    lane: "internal" as never,
    facts: [],
    href: `/data/${PATIENTS}`,
    organizationId: CLINIC,
    organizationName: "Cedar Ridge Physical Therapy",
    ...patch,
  });
  const capability = (id: string, items: HubItem[]): HubCapability =>
    ({ id, title: id, what: "", empty: "", door: "-", changedByKind: null, read: async () => ({ ok: true, items }) }) as unknown as HubCapability;

  it("Patients' own table row is Foundation; the intake form on it is not", async () => {
    const answer = {
      tables: [
        {
          table_id: PATIENTS, table_name: "Patients", organization_id: CLINIC, organization_name: "Cedar Ridge Physical Therapy",
          member: true, visibility: "internal", updated_at: null, mine: true, shared_with_me: false, platform_owned: false,
          kind: "table", foundation: true,
        },
      ],
      items: [],
      changed_by: [],
    } as unknown as DataHomeAnswer;
    const built = await buildDataHomeRows(
      { client: {} as RecordsClient, dataSource: {} as RecordsDataSource, answer },
      [
        capability("tables", [item({})]),
        capability("forms", [item({ id: "f0e1d2c3-0001-4b5a-9c8d-7e6f5a4b3c21", title: "Patient Intake", kind: "form" } as Partial<HubItem>)]),
      ],
    );
    const byName = Object.fromEntries(built.rows.map((r) => [r.name, r.foundation]));
    expect(byName).toEqual({ Patients: true, "Patient Intake": false });
  });
});
