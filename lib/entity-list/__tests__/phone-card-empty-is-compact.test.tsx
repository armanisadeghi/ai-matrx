/**
 * EMPTY IS COMPACT ON A PHONE CARD (page-pass 2026-09-27, /education/quizzes:
 * every card carried "—" rows for fields the row had no value for). A field
 * this row has nothing in is omitted; the meta line reads at 12px, not 11px.
 * Break: the card renders every declared field again → "omitted" red.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EntityPhoneCard, resolvePhoneCardLayout } from "../phoneCards";
import type { EntityColumnSpec } from "../columns";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; name: string; topic: string | null; level: string; updated: string };
const spec = (id: keyof Row & string, label: string, phone?: EntityColumnSpec<Row>["phone"]): EntityColumnSpec<Row> =>
  ({ id, label, phone, column: { id, accessorKey: id, header: label } }) as unknown as EntityColumnSpec<Row>;

it("omits a field the row has no value for, keeps the ones it has, meta on the type-secondary scale", async () => {
  const layout = resolvePhoneCardLayout([
    spec("name", "Name", "title"),
    spec("topic", "Topic", "primary"),
    spec("level", "Level", "primary"),
    spec("updated", "Updated", "meta"),
  ]);
  const row: Row = { id: "q1", name: "Unit 2 quiz", topic: null, level: "Medium", updated: "15h ago" };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EntityPhoneCard
        row={row}
        layout={layout}
        rowId={row.id}
        rowName={row.name}
        controls={{ renderCell: (id: string) => String(row[id as keyof Row] ?? "—"), actions: null, selectable: false, selected: false, onSelectedChange: () => {} } as never}
      />,
    );
  });
  const labels = [...host.querySelectorAll("dt")].map((d) => d.textContent);
  expect(labels).toEqual(["Level"]);
  expect(host.textContent).not.toContain("—");
  expect(host.textContent).toContain("15h ago");
  const meta = [...host.querySelectorAll("div")].find((d) => d.textContent?.includes("15h ago") && d.className.includes("gap-x-3"));
  // The meta line reads on the package type scale (w-s1), not a raw text size.
  expect(meta?.className).toContain("type-secondary");
  act(() => root.unmount());
  host.remove();
});
