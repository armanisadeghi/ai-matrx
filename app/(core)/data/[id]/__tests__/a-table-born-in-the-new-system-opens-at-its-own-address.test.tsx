/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). The owner of Cedar Ridge Physical Therapy made
 * "Treatment Rooms" on the data home, then opened it from her organization's Tables page, which
 * linked it at the older address /data/<id>. The page read "This table now lives in the new system.
 * Same table, same address; its organization switched its Data tables": false, the table was born
 * in the new system a minute earlier. RED before the lane: every store table got the moved line.
 * Now a table with no older row opens at /data-v2/<id>; a moved one keeps its line.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("@/features/unified-data/tableLivesIn", () => ({
  tableLivesIn: async () => ({ ok: true, livesIn: "record" }),
}));
let olderRow: { id: string; metadata: Record<string, unknown> } | null = null;
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: olderRow, error: null }) }) }),
      }),
    }),
  },
}));
jest.mock("@/app/(core)/data-v2/[tableId]/LivesInTheNewSystem", () => ({
  LivesInTheNewSystem: ({ children }: { children: React.ReactNode }) => <p data-testid="line">{children}</p>,
}));
jest.mock("@/components/user-generated-table-data/UserTableViewer", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/user-generated-table-data/TableIdentityMenu", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/user-generated-table-data/CreateTableModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/shell/components/header/RouteHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));

// eslint-disable-next-line import/first
import DataTableDetailClient from "../DataTableDetailClient";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replace.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

it("a table born in the new system opens at /data-v2/<id> and never says it moved", async () => {
  olderRow = null;
  await act(async () => root.render(<DataTableDetailClient tableId="89919d7d-cbbc-4600-8ea7-3f63db964631" />));
  await flush();
  expect(replace).toHaveBeenCalledWith("/data-v2/89919d7d-cbbc-4600-8ea7-3f63db964631");
  expect(host.textContent ?? "").not.toMatch(/switched its/);
});

it("a table that moved with its organization's switch keeps its line at the old address", async () => {
  olderRow = { id: "b00bde4d-1adc-4682-88eb-57453aabf014", metadata: { moved_to: { table_id: "b00bde4d" } } };
  await act(async () => root.render(<DataTableDetailClient tableId="b00bde4d-1adc-4682-88eb-57453aabf014" />));
  await flush();
  expect(replace).not.toHaveBeenCalled();
  expect(host.textContent ?? "").toMatch(/now lives in the new system/);
});
