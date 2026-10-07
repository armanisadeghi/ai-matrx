/**
 * A ROW'S "…" MENU NEVER REDRAWS EVERY ROW OF THE TABLE.
 *
 * 🚨 Measured live on /crm (2026-10-07): ticking ONE checkbox redrew all 25
 * rows. Every list writes its row menu inline — `<ItemMenu config={() =>
 * menuFor(row)}>` — so each render of the list handed every row a new getter,
 * and `MatrxDataTable` compares a non-handler function by identity (a render
 * prop that changed must redraw). `ItemMenu` declares `config` a lazy data
 * prop (`declareLazyDataProps`), so the table compares what the getter
 * RETURNS and hands the menu a trampoline to the latest getter.
 *
 * RED without the declaration in ItemMenu.tsx: every row redraws on every
 * host render.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { ItemMenu } from "../ItemMenu";
import type { ItemMenuConfig } from "../types";

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `row-${i}`, name: `Row ${i}` }));

let triggerRenders = new Map<string, number>();
const Trigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { rowId: string }>(
  function Trigger({ rowId, ...props }, ref) {
    triggerRenders.set(rowId, (triggerRenders.get(rowId) ?? 0) + 1);
    return <button ref={ref} type="button" aria-label={`Actions for ${rowId}`} {...props} />;
  },
);

let rerenderHost: () => void = () => undefined;
let lastSelected = "";

/** Writes everything inline, the way /crm and ~40 other lists do. */
function Host() {
  const [tick, setTick] = useState(0);
  rerenderHost = () => setTick((t) => t + 1);
  const menuFor = (row: Row) => (): ItemMenuConfig => ({
    sections: [{ id: "main", items: [{ id: "open", label: "Open", onSelect: () => { lastSelected = `${row.id}@${tick}`; } }] }],
  });
  return (
    <MatrxDataTable<Row>
      data={ROWS}
      columns={[
        { accessorKey: "name", header: "Name" },
        {
          id: "custom-actions",
          header: "Actions",
          sortable: false,
          filter: false,
          customActions: (row) => (
            <ItemMenu config={menuFor(row)} align="end">
              <Trigger rowId={row.id} />
            </ItemMenu>
          ),
        },
      ]}
      getRowId={(row) => row.id}
      onRowOpen={() => undefined}
      pageSize={0}
      selection={false}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      virtualize={{ enabled: false }}
    />
  );
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  triggerRenders = new Map();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

beforeEach(() => { lastSelected = ""; });
const total = () => [...triggerRenders.values()].reduce((n, v) => n + v, 0);

it("re-rendering the list with fresh inline menu getters redraws no row", () => {
  act(() => root.render(<Host />));
  expect(triggerRenders.size).toBe(ROWS.length);
  const before = total();
  for (let i = 0; i < 3; i += 1) act(() => rerenderHost());
  expect(total() - before).toBe(0);

});

it("a row that was not redrawn opens its menu with the host's LATEST getter", () => {
  act(() => root.render(<Host />));
  for (let i = 0; i < 3; i += 1) act(() => rerenderHost());
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions for row-3"]')!;
  act(() => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
    trigger.click();
  });
  const open = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes("Open"));
  expect(open).toBeDefined();
  act(() => open!.click());
  expect(lastSelected).toBe("row-3@3");
});
