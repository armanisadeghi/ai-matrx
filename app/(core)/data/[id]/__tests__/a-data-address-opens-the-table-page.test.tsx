/**
 * THE USE CASE. A link an agent sent last month names "Treatment Rooms" at /data/<id>. Every table
 * lives in the record store, so the address opens the table page itself — the same screen as
 * /data-v2/<id>, for the same id — and reads nothing else first.
 */
import React, { Suspense, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ROOMS = "6b0f1d0e-4f43-4c9e-9a59-2f1e7d3c8a10";
const db = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: new Proxy({}, { get: () => db }), createClient: () => new Proxy({}, { get: () => db }) }));
jest.mock("@/features/unified-data/table-page/UnifiedDataTablePage", () => ({
  UnifiedDataTablePage: ({ tableId }: { tableId: string }) => <p data-testid="table-page">{tableId}</p>,
}));

// eslint-disable-next-line import/first
import DataTableDetailClient from "../DataTableDetailClient";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("/data/<id> mounts the table page for that id and reads nothing on its own", async () => {
  await act(async () => {
    root.render(<Suspense fallback={null}><DataTableDetailClient tableId={ROOMS} /></Suspense>);
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(host.querySelector('[data-testid="table-page"]')?.textContent).toBe(ROOMS);
  expect(db).not.toHaveBeenCalled();
});
