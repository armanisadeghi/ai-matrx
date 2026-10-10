// The page shows the ACTIVE version or nothing. Before: a read that had not found her row yet (a reload, a
// slow list, a failed list) fell back to the starting layout (6 widgets, one counts tile) as if it were hers.
import { act } from "react";
import { createRoot } from "react-dom/client";

const world: { rows: Record<string, unknown>[]; loading: boolean; error: { message: string } | null } = { rows: [], loading: false, error: null };
const listAppRows = jest.fn(async () => ({ ok: true as const, data: { rows: [{ person: "u1" }] } }));
jest.mock("@ai-matrx/records/react", () => ({
  listAppRows: (...a: unknown[]) => (listAppRows as any)(...a),
  upsertAppRow: jest.fn(async () => ({ ok: true })),
  useRecordsClient: () => ({ config: { organizationId: "org1" } }),
  useTypedTable: () => ({ ...world, reload: jest.fn() }),
}));
jest.mock("@ai-matrx/records/versions", () => ({ readVersionNow: jest.fn() }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "u1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u1" }));
jest.mock("../../useStartPage", () => ({ useStartPage: () => ({ loading: false, pageId: null }) }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("../seedOnce", () => ({
  browserLock: jest.fn(),
  seedStartLayoutOnce: jest.fn(() => new Promise(() => {})), // never settles: the seed is still deciding
}));

import { upsertAppRow } from "@ai-matrx/records/react";
import { useStartLayout } from "../../useStartLayout";
import { defaultStartDoc } from "../defaultDoc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read() {
  let api!: ReturnType<typeof useStartLayout>;
  function Probe() {
    api = useStartLayout();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return api;
}

const active = JSON.stringify({ schema: 1, widgets: Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, type: "tasks", size: "m", config: {} })) });

it("shows the saved row's layout, not the starting layout", () => {
  Object.assign(world, { loading: false, error: null, rows: [{ _id: "r1", person: "u1", doc: active, saved_at: "2026-01-01", _organizationId: "org1" }] });
  expect(read().doc?.widgets).toHaveLength(10);
});

it("shows NO layout while her row has not been found and the first layout is still being decided", () => {
  Object.assign(world, { loading: false, error: null, rows: [] });
  const api = read();
  expect(api.doc).toBeNull();
  expect(api.loading).toBe(true);
  expect(api.doc).not.toEqual(defaultStartDoc(null));
});

it("a failed read says so instead of showing the starting layout", () => {
  Object.assign(world, { loading: false, error: { message: "read failed" }, rows: [] });
  const api = read();
  expect(api.doc).toBeNull();
  expect(api.error).toBe("read failed");
});

it("a save that changes nothing writes NO new version; a real change does", async () => {
  Object.assign(world, { loading: false, error: null, rows: [{ _id: "r1", person: "u1", doc: active, saved_at: "2026-01-01", _organizationId: "org1" }] });
  (upsertAppRow as jest.Mock).mockClear();
  const api = read();
  const unchanged = await api.save(api.doc!, "Saved layout");
  expect(unchanged).toEqual({ ok: true });
  expect(upsertAppRow).not.toHaveBeenCalled();
  const changed = { ...api.doc!, widgets: api.doc!.widgets.slice(1) };
  await api.save(changed, "Removed one");
  expect(upsertAppRow).toHaveBeenCalledTimes(1);
});
