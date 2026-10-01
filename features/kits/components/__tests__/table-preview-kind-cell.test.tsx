/**
 * V8 — a kit table preview's record cell holding a kind shows the kind cell
 * peek (the records grid's own chip), never its JSON.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/unified-data/recordsReferences", () => ({
  recordsRenderKind: ({ kind }: { kind: string }) => <span data-kind-chip={kind} />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => <span data-entity-ref="1" />,
}));

import { TablePreview } from "../TablePreview";
import type { KitTable } from "../../types";

const KIND = { __kind: "timeline", title: "History", events: [] };

function table(value: unknown): KitTable {
  return {
    name: "Plans",
    description: null,
    fields: [{ key: "plan", label: "Plan", type: "json", required: false }],
    records: [{ plan: value }],
  } as unknown as KitTable;
}

describe("kit table preview: a kind cell is a kind (V8)", () => {
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

  it.each([
    ["an object", KIND],
    ["JSON text", JSON.stringify(KIND)],
  ])("a kind stored as %s shows its chip, never JSON", (_label, value) => {
    act(() => root.render(<TablePreview table={table(value)} refNames={{}} previewRows={5} />));
    expect(container.querySelector('[data-kind-chip="timeline"]')).not.toBeNull();
    expect(container.textContent).not.toContain("__kind");
  });

  it("unreadable kind text says so", () => {
    act(() => root.render(<TablePreview table={table('{"__kind":"timeline","events":[')} refNames={{}} previewRows={5} />));
    expect(container.querySelector("[data-kind-cell-broken]")).not.toBeNull();
    expect(container.textContent).not.toContain("__kind");
  });

  it("a kindless object stays as data", () => {
    act(() => root.render(<TablePreview table={table({ a: 1 })} refNames={{}} previewRows={5} />));
    expect(container.textContent).toContain('{"a":1}');
  });
});
