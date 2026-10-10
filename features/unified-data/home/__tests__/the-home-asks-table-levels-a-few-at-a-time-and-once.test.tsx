/**
 * DATA-HOME-2 — THE HOME ASKS `custom.my_levels` A FEW CALLS AT A TIME, AND ONCE PER TABLE.
 * One call per organization used to leave all of them in flight together (34 at once for one member), and
 * every render that changed the list asked again for the ids still waiting, so one organization was asked
 * thirteen times; together they ran past the statement timeout (57014, a 500 on /data).
 * Breaks named:
 * - more than three calls are out at one moment → red.
 * - a re-render with a changed list asks again for ids a call is already out for → red.
 * - an organization's answer is lost, or lands on the wrong table → red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let inFlight = 0;
let peak = 0;
const calls: Array<{ organizationId: string; ids: string[] }> = [];
const releases: Array<() => void> = [];

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: (config: { organizationId: string }) => ({
    myLevels: ({ ids }: { ids: string[] }) =>
      new Promise((resolve) => {
        calls.push({ organizationId: config.organizationId, ids });
        inFlight++;
        peak = Math.max(peak, inFlight);
        releases.push(() => {
          inFlight--;
          resolve({ ok: true, data: ids.map((id) => ({ id, level: "viewer" })) });
        });
      }),
  }),
}));
jest.mock("@ai-matrx/records/react", () => ({
  RecordsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRecordsClient: () => ({ config: { organizationId: null } }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("@/features/unified-data/actions/useTableFavorite", () => ({ useStarToggle: () => ({ toggle: jest.fn() }) }));

// eslint-disable-next-line import/first
import { useTableLevels } from "../useDataHomeRowMenus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tablesOf = (orgs: number) =>
  Array.from({ length: orgs }, (_, o) => ({ tableId: `00000000-0000-4000-8000-${String(o).padStart(12, "0")}`, organizationId: `org-${o}` }));

let seen: ReadonlyMap<string, unknown> = new Map();
function Probe({ tables }: { tables: ReturnType<typeof tablesOf> }) {
  seen = useTableLevels(tables);
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("the home's level lookup", () => {
  it("keeps at most three calls out, asks each table once across re-renders, and answers every table", async () => {
    const first = tablesOf(10);
    await act(async () => root.render(<Probe tables={first} />));
    await settle();
    // the list grows while the first calls are still out: the ten already asked are not asked again
    await act(async () => root.render(<Probe tables={tablesOf(12)} />));
    await settle();
    expect(peak).toBeLessThanOrEqual(3);

    for (let guard = 0; guard < 40 && (releases.length > 0 || inFlight > 0); guard++) {
      const next = releases.shift();
      if (next) await act(async () => next());
      await settle();
    }

    const asked = calls.flatMap((c) => c.ids);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked).toHaveLength(12);
    for (const t of tablesOf(12)) expect(seen.get(t.tableId)).toBe("viewer");
    expect(peak).toBeLessThanOrEqual(3);
  });
});
