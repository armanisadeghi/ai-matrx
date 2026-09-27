/**
 * CANCEL ON "TABLE COLORS" CHANGES NOTHING (DATA-V2-BASICS-2 C2).
 *
 * THE USE CASE: Harbor Dental's front desk opens Colors on "Insurance Plan Accounts", tries
 * "Color by a column → Status" to see how it looks, and presses Cancel. The rows were repainted
 * the moment Status was picked (the preview is good) — and they STAYED painted after Cancel,
 * because the colour-by was written at the pick and Cancel only closed the dialog. Cancel must put
 * back the colour-by the table had when the dialog opened; Save keeps it.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TableStyle } from "@ai-matrx/design-system/data-table/table-style";

jest.mock("@ai-matrx/design-system", () => {
  const actual = jest.requireActual("@ai-matrx/design-system");
  return actual;
});

import { ColorRulesDialog } from "../components/ColorRulesDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELDS = [
  { id: "f-account", field_name: "account", display_name: "Account", data_type: "string", metadata: {} },
  {
    id: "f-status",
    field_name: "status",
    display_name: "Status",
    data_type: "string",
    metadata: { format: { id: "choice", options: { choices: [{ value: "Verified", color: "green" }] } } },
  },
] as never[];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

let paint: (style: TableStyle) => void = () => {};

function Harness({ onSetPath, onClosed }: { onSetPath: jest.Mock; onClosed: () => void }) {
  const [style, setStyle] = React.useState<TableStyle>({ version: 1 });
  const [open, setOpen] = React.useState(true);
  paint = setStyle;
  return (
    <ColorRulesDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClosed();
      }}
      fields={FIELDS}
      style={style}
      onSetPath={async (path, value) => {
        onSetPath(path, value);
      }}
    />
  );
}

function press(label: string) {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`no "${label}" button`);
  return act(async () => {
    b.click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

it("Cancel after picking a colour-by puts back what the table had (nothing)", async () => {
  const onSetPath = jest.fn();
  const onClosed = jest.fn();
  act(() => root.render(<Harness onSetPath={onSetPath} onClosed={onClosed} />));
  // The pick wrote colour-by Status and the Sheet repainted: the style the dialog is handed now carries it.
  act(() => paint({ version: 1, colorBy: { field: "status", target: "row" } }));
  await press("Cancel");
  expect(onSetPath).toHaveBeenCalledTimes(1);
  expect(onSetPath.mock.calls[0]![1]).toBeNull();
  expect(onClosed).toHaveBeenCalled();
});

it("Save keeps the colour-by that was picked", async () => {
  const onSetPath = jest.fn();
  const onClosed = jest.fn();
  act(() => root.render(<Harness onSetPath={onSetPath} onClosed={onClosed} />));
  act(() => paint({ version: 1, colorBy: { field: "status", target: "row" } }));
  await press("Save");
  // Only the rules are written on Save; the colour-by is never put back.
  expect(onSetPath.mock.calls.every(([, v]) => v === null || Array.isArray(v))).toBe(true);
  expect(onSetPath.mock.calls.find(([path]) => JSON.stringify(path).includes("color"))).toBeUndefined();
  expect(onClosed).toHaveBeenCalled();
});

it("Cancel with nothing changed writes nothing", async () => {
  const onSetPath = jest.fn();
  act(() => root.render(<Harness onSetPath={onSetPath} onClosed={() => {}} />));
  await press("Cancel");
  expect(onSetPath).not.toHaveBeenCalled();
});
