/**
 * DATA-HOME-3F — three fix-before-Arman defects of VERIFY-DATA-HOME-3 (Verify 2):
 *   W3 a phone card is two lines (name, then kind · organization · updated), never labelled
 *      fields, an empty line or "2 more fields";
 *   W4 the archive (the list's Archived filter, TABLE-ACTIONS item 10) is read only when that
 *      filter asks, 200 at a time, and a statement timeout (57014) is said in a person's words —
 *      never Postgres's sentence;
 *   W5 the cards view reads the SAME lazy Records counter as the table's cells.
 * Break any one (fields density on the home, PAGE back to 1000, the archive read on first paint,
 * the raw message, `row.records` on the card) and its block goes red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EntityPhoneCard, resolvePhoneCardLayout } from "@/lib/entity-list/phoneCards";
import { dataHomeColumns } from "../dataHomeColumns";
import { createRecordCountStore } from "../dataHomeRecordCounts";
import { DataHomeCards } from "../DataHomeViews";
import { ORGS, row } from "./fixtures";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});
jest.mock("@/components/official/item/ItemMenu", () => ({
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const archived = jest.fn();
const archivedPortals = jest.fn();
jest.mock("@/features/unified-data/hub/doors", () => ({
  ...jest.requireActual("@/features/unified-data/hub/doors"),
  archivedTablesEverywhere: (...args: unknown[]) => archived(...args),
  archivedPortalsEverywhere: (...args: unknown[]) => archivedPortals(...args),
}));

// eslint-disable-next-line import/first
import { ARCHIVE_PAGE, readArchivedDataHome } from "../dataHomeArchived";
// eslint-disable-next-line import/first
import { createDataHomeService } from "../dataHomeService";
// eslint-disable-next-line import/first
import { DEFAULT_ENTITY_LIST_QUERY, type EntityListQuery } from "@/lib/entity-list/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  archived.mockReset();
  archivedPortals.mockReset();
  archivedPortals.mockResolvedValue({ ok: true, data: [] });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

describe("W3 — a data-home phone card is two lines", () => {
  it("draws the name, then kind · organization · updated, with no labels and no 'more fields'", async () => {
    const r = row({ name: "Patient Recall List", kind: "table", updatedAt: "2026-09-30T12:00:00.000Z" });
    const specs = dataHomeColumns({ organizationName: () => ORGS.harbor.name });
    const layout = resolvePhoneCardLayout(specs, { doorColumn: "name" });
    const cell = (id: string) =>
      id === "name" ? r.name : id === "kind" ? "Table" : id === "organization" ? r.organizationName : id === "updated" ? "1d ago" : id === "favorite" ? "☆" : `rest:${id}`;
    await act(async () => {
      root.render(
        <EntityPhoneCard
          row={r}
          layout={layout}
          density="line"
          rowId={r.id}
          rowName={r.name}
          controls={{ renderCell: cell, actions: null, selectable: false, selected: false, onSelectedChange: () => {} } as never}
        />,
      );
    });
    expect(host.querySelectorAll("dt")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/more field/);
    expect(host.querySelector("[data-entity-phone-card-line]")?.textContent).toBe(`Table·${ORGS.harbor.name}·1d ago`);
    // Records, Owner and Access are `rest`: not on the card at all (the row opens the table).
    expect(host.textContent).not.toContain("rest:");
  });

  it("the home asks the shell for the line density (never a fork of the card)", async () => {
    const source = await import("fs").then((fs) =>
      fs.readFileSync(require.resolve("../DataHomeList.tsx"), "utf8"),
    );
    expect(source).toMatch(/phoneCardDensity:\s*"line"/);
  });
});

describe("W5 — the cards view reads the one lazy Records counter", () => {
  it("a card shows the count the table's cell would show", async () => {
    const r = row({ name: "Tag" });
    const ask = jest.fn(async () => ({ ok: true as const, data: [{ table_id: r.tableId!, visible_rows: 5 }] }));
    const store = createRecordCountStore(ask, 0);
    await act(async () => {
      root.render(
        <DataHomeCards
          {...({
            rows: [r],
            hrefFor: () => r.href,
            actions: { menuFor: () => () => ({ sections: [] }) },
            isStarred: () => false,
            onOpened: () => {},
            recordCounts: store,
          } as unknown as React.ComponentProps<typeof DataHomeCards>)}
        />,
      );
    });
    await flush();
    await flush();
    expect(ask).toHaveBeenCalledWith(r.organizationId, [r.tableId]);
    expect(host.querySelector("[data-data-home-card-records]")?.textContent).toBe("5 records");
  });
});

function archivedRows(n: number, from = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `arch-${from + i}`,
    document: { name: `Retired intake form ${from + i}` },
    archived_at: "2026-09-20T10:00:00.000Z",
    archived_by_name: "Dana Reyes",
    organization_id: ORGS.harbor.id,
    organization_name: ORGS.harbor.name,
  }));
}

const SORT = { sort: "updated", direction: "desc" as const, favoritesFirst: false, pageSize: 1000 };
const query = (archivedAxis: EntityListQuery["archived"]): EntityListQuery => ({ ...DEFAULT_ENTITY_LIST_QUERY, archived: archivedAxis });

function homeService(loadArchived: () => Promise<ReturnType<typeof row>[]>) {
  return createDataHomeService({
    load: async () => [row({ name: "Referral Intake Queue" }), row({ name: "Insurance Plan Accounts" })],
    loadArchived,
    isStarred: () => false,
    ownerLabel: () => null,
  });
}

describe("W4 — the archive is the list's Archived filter, read only when asked", () => {
  it("the active list never reads the archive; Archived only shows only archived rows", async () => {
    const loadArchived = jest.fn(async () => [row({ name: "Retired intake form 1", archived: true })]);
    const service = homeService(loadArchived);
    const active = await service.fetchPage(query("active"), SORT);
    expect(loadArchived).not.toHaveBeenCalled();
    expect(active.rows.map((r) => r.name).sort()).toEqual(["Insurance Plan Accounts", "Referral Intake Queue"]);
    const only = await service.fetchPage(query("archived"), SORT);
    expect(loadArchived).toHaveBeenCalledTimes(1);
    expect(only.rows.map((r) => r.name)).toEqual(["Retired intake form 1"]);
  });

  it("Show all holds both halves", async () => {
    const service = homeService(async () => [row({ name: "Retired intake form 1", archived: true })]);
    const both = await service.fetchPage(query("all"), SORT);
    expect(both.rows.map((r) => r.name).sort()).toEqual(["Insurance Plan Accounts", "Referral Intake Queue", "Retired intake form 1"]);
  });

  it("asks 200 at a time until a short page, never the whole archive in one call", async () => {
    archived.mockImplementation(async (_ds: unknown, page: { limit: number; offset: number }) => ({
      ok: true,
      data: archivedRows(page.offset >= 400 ? 7 : page.limit, page.offset),
    }));
    const rows = await readArchivedDataHome({} as never);
    expect(ARCHIVE_PAGE).toBe(200);
    expect(archived.mock.calls.map((c) => c[1])).toEqual([
      { limit: 200, offset: 0 },
      { limit: 200, offset: 200 },
      { limit: 200, offset: 400 },
    ]);
    expect(rows).toHaveLength(407);
    expect(rows.every((r) => r.archived === true && r.kind === "table")).toBe(true);
  });

  it("a planted 57014 is said in a person's words, never the Postgres text", async () => {
    archived.mockResolvedValueOnce({ ok: false, error: { message: "canceling statement due to statement timeout", sqlstate: "57014" } });
    const failure = await readArchivedDataHome({} as never).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(failure?.message).toBe("The archive took too long to answer. Try again in a moment.");
    expect(failure?.message).not.toMatch(/canceling|statement timeout|57014/i);
  });
});

describe("W4's sibling — the list's own read never prints the statement timeout", () => {
  it("doorFailureLine words 57014 for a person and passes a store sentence unedited", async () => {
    const { doorFailureLine } = jest.requireActual("@/features/unified-data/hub/doors") as typeof import("@/features/unified-data/hub/doors");
    expect(doorFailureLine({ message: "canceling statement due to statement timeout", sqlstate: "57014" })).toBe(
      "It took too long to answer.",
    );
    expect(doorFailureLine({ message: "canceling statement due to statement timeout" })).not.toMatch(/canceling/);
    expect(doorFailureLine({ message: "You are not a member of Harbor Dental Group." })).toBe(
      "You are not a member of Harbor Dental Group.",
    );
  });
});
