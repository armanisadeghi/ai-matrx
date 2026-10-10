import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
const mockClient = {};
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => mockClient }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const HARBOR = "11111111-1111-4111-8111-111111111111";
const ROOFING = "22222222-2222-4222-8222-222222222222";
const tableRow = (id: string, name: string, org: string, orgName: string) => ({
  id: `table:${org}:${id}`,
  kind: "table",
  tableId: id,
  name,
  href: `/data/${id}`,
  organizationId: org,
  organizationName: orgName,
});
let rows: unknown[] = [];
let loadFails = false;
jest.mock("@/features/unified-data/home/dataHomeCorpus", () => ({
  createDataHomeCorpus: () => ({
    load: () => (loadFails ? Promise.reject(new Error("Could not read tables.")) : Promise.resolve(rows)),
  }),
}));

const mapFields = jest.fn();
const counts = jest.fn();
jest.mock("@/features/unified-data/hub/doors", () => ({
  TABLE_MAP_MAX: 500,
  doorFailureLine: (failure: { message: string }) => failure.message,
  tableMapFields: (...a: unknown[]) => mapFields(...a),
  tableRowCounts: (...a: unknown[]) => counts(...a),
}));

// The drawing itself needs a real browser layout; here each card is a button carrying what it would show.
jest.mock("../TableMapCanvas", () => ({
  __esModule: true,
  default: ({ map, onOpen }: { map: { groups: Array<{ organizationName: string; cards: Array<{ id: string; name: string; href: string }> }>; links: unknown[] }; onOpen: (c: unknown) => void }) => (
    <div data-links={map.links.length}>
      {map.groups.map((g) => (
        <section key={g.organizationName} data-org={g.organizationName}>
          {g.cards.map((c) => (
            <button key={c.id} onClick={() => onOpen(c)}>
              {c.name}
            </button>
          ))}
        </section>
      ))}
    </div>
  ),
}));

// eslint-disable-next-line import/first
import { DataHomeMap } from "../DataHomeMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  push.mockReset();
  mapFields.mockReset();
  counts.mockReset();
  counts.mockResolvedValue({ ok: true, data: [] });
  mapFields.mockResolvedValue({ ok: true, data: [] });
  loadFails = false;
  rows = [
    tableRow("patients", "Patients", HARBOR, "Harbor Dental Group"),
    tableRow("visits", "Visits", HARBOR, "Harbor Dental Group"),
    tableRow("jobs", "Jobs", ROOFING, "Titanium Roofing"),
    { ...tableRow("form1", "Intake form", HARBOR, "Harbor Dental Group"), kind: "form" },
  ];
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount(props: { organizationFilter?: string | null } = {}) {
  await act(async () => {
    root.render(<DataHomeMap dataSource={{} as never} organizationFilter={props.organizationFilter ?? null} showPlatformTables={false} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("the data home map", () => {
  it("asks for the links with ONE call per organization, never one per table", async () => {
    await mount();
    expect(mapFields).toHaveBeenCalledTimes(2);
    expect(new Set(mapFields.mock.calls.map((c) => c[1]))).toEqual(new Set([HARBOR, ROOFING]));
    const harbor = mapFields.mock.calls.find((c) => c[1] === HARBOR)!;
    expect([...(harbor[2] as string[])].sort()).toEqual(["patients", "visits"]);
  });

  it("maps tables only (a form is not a card) and groups them by organization", async () => {
    await mount();
    expect(host.querySelectorAll("[data-org]")).toHaveLength(2);
    expect(host.textContent).toContain("Patients");
    expect(host.textContent).not.toContain("Intake form");
  });

  it("follows the organization filter", async () => {
    await mount({ organizationFilter: ROOFING });
    expect(mapFields).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Jobs");
    expect(host.textContent).not.toContain("Patients");
  });

  it("opens a table when its card is pressed", async () => {
    await mount();
    const card = [...host.querySelectorAll("button")].find((b) => b.textContent === "Visits")!;
    await act(async () => card.click());
    expect(push).toHaveBeenCalledWith("/data/visits");
  });

  it("says so when there is nothing to map, and when the read fails", async () => {
    rows = [];
    await mount();
    expect(host.querySelector("[data-table-map-empty]")).not.toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    loadFails = true;
    await mount();
    expect(host.textContent).toContain("The map could not be drawn");
  });

  it("keeps the map and says so when the links could not be read", async () => {
    mapFields.mockResolvedValue({ ok: false, error: { message: "permission denied" } });
    await mount();
    expect(host.textContent).toContain("Some links could not be read");
    expect(host.textContent).toContain("Patients");
  });
});
