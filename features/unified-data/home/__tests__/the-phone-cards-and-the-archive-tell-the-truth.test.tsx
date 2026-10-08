/**
 * DATA-HOME-3F — three fix-before-Arman defects of VERIFY-DATA-HOME-3 (Verify 2):
 *   W3 a phone card is two lines (name, then kind · organization · updated), never labelled
 *      fields, an empty line or "2 more fields";
 *   W4 the archive (the list's Archived filter, TABLE-ACTIONS item 10) is read only when that
 *      filter asks, ONE store page per list page (the first rows draw after one read), with no
 *      count made by a full read, and a statement timeout (57014) is said in a person's words;
 *   W5 the cards view reads the SAME lazy Records counter as the table's cells.
 * Break any one (fields density on the home, the archive read whole before the first page, a
 * count made by a full read, the raw message, `row.records` on the card) and its block goes red.
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
jest.mock("@ai-matrx/design-system/item", () => ({
  ...jest.requireActual("@ai-matrx/design-system/item"),
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
import { readArchivedDataHomePage } from "../dataHomeArchived";
// eslint-disable-next-line import/first
import { ARCHIVE_READ, ARCHIVE_READ_MAX, createDataHomeService, type ArchiveSort } from "../dataHomeService";
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

const SORT = { sort: "updated", direction: "desc" as const, favoritesFirst: false, pageSize: 25 };
const query = (archivedAxis: EntityListQuery["archived"], over: Partial<EntityListQuery> = {}): EntityListQuery => ({
  ...DEFAULT_ENTITY_LIST_QUERY,
  archived: archivedAxis,
  ...over,
});

/** A store archive of `size` tables, newest first, answered a page at a time like the door. */
function storeArchive(size: number, orgOf: (i: number) => string = () => ORGS.harbor.id) {
  return jest.fn(async (page: { offset: number; limit: number }, _sort?: ArchiveSort) => {
    const rows = Array.from({ length: Math.max(0, Math.min(page.limit, size - page.offset)) }, (_, i) =>
      row({ name: `Retired intake form ${page.offset + i}`, archived: true, organizationId: orgOf(page.offset + i) }),
    );
    return { rows, ended: page.offset + rows.length >= size };
  });
}

function homeService(readArchived: ReturnType<typeof storeArchive>) {
  return createDataHomeService({
    load: async () => [row({ name: "Referral Intake Queue" }), row({ name: "Insurance Plan Accounts" })],
    readArchived,
    isStarred: () => false,
    ownerLabel: () => null,
  });
}

describe("W4 — the Archived filter pages like the store pages it", () => {
  it("the active list never reads the archive", async () => {
    const readArchived = storeArchive(1300);
    const active = await homeService(readArchived).fetchPage(query("active"), SORT);
    expect(readArchived).not.toHaveBeenCalled();
    expect(active.rows.map((r) => r.name).sort()).toEqual(["Insurance Plan Accounts", "Referral Intake Queue"]);
  });

  it("the first page draws after ONE store read, with no count and a next page", async () => {
    const readArchived = storeArchive(1300);
    const first = await homeService(readArchived).fetchPage(query("archived"), SORT);
    expect(readArchived.mock.calls.map((c) => c[0])).toEqual([{ offset: 0, limit: ARCHIVE_READ }]);
    expect(first.rows.map((r) => r.name)).toEqual(Array.from({ length: 25 }, (_, i) => `Retired intake form ${i}`));
    expect(first).toMatchObject({ total: 25, hasMore: true });
  });

  it("a 100-row page is ONE store read, sized to the page", async () => {
    const readArchived = storeArchive(1300);
    const page = await homeService(readArchived).fetchPage(query("archived"), { ...SORT, pageSize: 100 });
    expect(readArchived.mock.calls.map((c) => c[0])).toEqual([{ offset: 0, limit: 101 }]);
    expect(page).toMatchObject({ total: 100, hasMore: true });
  });

  it("a later page reads the store only when the rows in hand run out", async () => {
    // (pages 1 and 3 fit the first read of 100; page 6 needs one more)
    const readArchived = storeArchive(130);
    const service = homeService(readArchived);
    await service.fetchPage(query("archived"), SORT);
    const p3 = await service.fetchPage(query("archived", { page: 3 }), SORT);
    expect(readArchived).toHaveBeenCalledTimes(1);
    expect(p3.rows[0]?.name).toBe("Retired intake form 50");
    const p6 = await service.fetchPage(query("archived", { page: 6 }), SORT);
    expect(readArchived.mock.calls.map((c) => c[0])).toEqual([
      { offset: 0, limit: ARCHIVE_READ },
      { offset: ARCHIVE_READ, limit: ARCHIVE_READ },
    ]);
    expect(p6).toMatchObject({ total: 130, hasMore: false });
    expect(p6.rows.map((r) => r.name)).toEqual(Array.from({ length: 5 }, (_, i) => `Retired intake form ${125 + i}`));
  });

  // Breaks caught: the archive ignoring the column sort (always newest archived first), or a new
  // sort reading on from the old order's offset instead of starting the store's pages over.
  it("a column sort is asked of the store, and a new sort starts the archive's pages over", async () => {
    const readArchived = storeArchive(1300);
    const service = homeService(readArchived);
    await service.fetchPage(query("archived"), { ...SORT, sort: "name", direction: "asc" });
    await service.fetchPage(query("archived", { page: 2 }), { ...SORT, sort: "name", direction: "asc" });
    await service.fetchPage(query("archived"), { ...SORT, sort: "organization", direction: "desc" });
    await service.fetchPage(query("archived"), { ...SORT, sort: "kind", direction: "asc" });
    expect(readArchived.mock.calls.map((c) => [c[0].offset, c[1]])).toEqual([
      [0, { sort: "name", desc: false }],
      [0, { sort: "organization", desc: true }],
      [0, { sort: "archived_at", desc: true }],
    ]);
  });

  it("the organization filter keeps reading pages until this page is full", async () => {
    // Every 10th archived table is Titanium Roofing's; 25 of them need 250 rows read.
    const readArchived = storeArchive(1300, (i) => (i % 10 === 0 ? ORGS.titanium.id : ORGS.harbor.id));
    const page = await homeService(readArchived).fetchPage(query("archived", { orgId: ORGS.titanium.id }), SORT);
    expect(page.rows).toHaveLength(25);
    expect(page.rows.every((r) => r.organizationId === ORGS.titanium.id)).toBe(true);
    // One read sized to the page, then the largest steps — never 100 at a time through a narrow filter.
    expect(readArchived.mock.calls.map((c) => c[0])).toEqual([
      { offset: 0, limit: ARCHIVE_READ },
      { offset: ARCHIVE_READ, limit: ARCHIVE_READ_MAX },
    ]);
  });

  it("Show all lists the live rows, then the archive, open-ended", async () => {
    const page = await homeService(storeArchive(1300)).fetchPage(query("all"), SORT);
    expect(page.rows.slice(0, 2).map((r) => r.name).sort()).toEqual(["Insurance Plan Accounts", "Referral Intake Queue"]);
    expect(page.rows[2]?.name).toBe("Retired intake form 0");
    expect(page.hasMore).toBe(true);
  });

  it("no lane count or facet is made by reading the whole archive", async () => {
    const readArchived = storeArchive(1300);
    const service = homeService(readArchived);
    expect(await service.fetchCounts(query("archived"))).toEqual({ byKind: {}, narrow: {}, uncounted: true });
    expect(await service.fetchFacets(query("archived"))).toEqual({ byKind: {} });
    expect(readArchived).not.toHaveBeenCalled();
  });

  it("the reader asks the store for one page and adds the portals only after the tables end", async () => {
    archived.mockImplementation(async (_ds: unknown, page: { limit: number; offset: number }) => ({
      ok: true,
      data: archivedRows(page.offset >= 100 ? 7 : page.limit, page.offset),
    }));
    archivedPortals.mockResolvedValue({
      ok: true,
      data: [{ portal_id: "p-1", title: "Cedar Ridge patient portal", client_table_id: "t-1", client_table: "Patients", organization_id: ORGS.harbor.id, organization_name: ORGS.harbor.name }],
    });
    const first = await readArchivedDataHomePage({} as never, { offset: 0, limit: 100 });
    expect(first).toMatchObject({ ended: false });
    expect(first.rows).toHaveLength(100);
    expect(archivedPortals).not.toHaveBeenCalled();
    const last = await readArchivedDataHomePage({} as never, { offset: 100, limit: 100 });
    expect(last.ended).toBe(true);
    expect(last.rows.map((r) => r.kind)).toEqual([...Array(7).fill("table"), "portal"]);
  });

  it("an archived table I made is Mine; one somebody else made is not", async () => {
    const DANA = "6c1f0b52-8d3e-4b7a-9f21-3e5d4c2b1a90";
    const LUIS = "9a2e4d61-7b5c-4f3e-8d2a-1c0b9e8f7a65";
    archived.mockResolvedValueOnce({
      ok: true,
      data: [
        { ...archivedRows(1)[0], id: "mine-1", created_by: DANA, created_by_name: "Dana Reyes" },
        { ...archivedRows(1, 1)[0], id: "theirs-1", created_by: LUIS, created_by_name: "Luis Ortega" },
      ],
    });
    const page = await readArchivedDataHomePage({} as never, { offset: 0, limit: 100 }, DANA);
    // The maker's name comes from the door (custom.archived_tables_everywhere, tableactions_d).
    expect(page.rows.map((r) => [r.itemId, r.mine, r.createdByName])).toEqual([
      ["mine-1", true, "Dana Reyes"],
      ["theirs-1", false, "Luis Ortega"],
    ]);
  });

  it("a planted 57014 is said in a person's words, never the Postgres text", async () => {
    archived.mockResolvedValueOnce({ ok: false, error: { message: "canceling statement due to statement timeout", sqlstate: "57014" } });
    const failure = await readArchivedDataHomePage({} as never, { offset: 0, limit: 100 }).then(
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
