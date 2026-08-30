import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MatrxDataTable } from "./MatrxDataTable";
import type { MatrxColumnDef } from "./types";

interface Row {
  id: string;
  name: string;
}

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
  configurable: true,
});

describe("MatrxDataTable edited row actions", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("gives row actions the visible draft and lets the action discard it", () => {
    const columns: MatrxColumnDef<Row>[] = [
      {
        accessorKey: "name",
        header: "Name",
        editable: "string",
        cell: (row) => row.name,
      },
    ];

    act(() => {
      root.render(
        <MatrxDataTable
          data={[{ id: "row-a", name: "Original" }]}
          columns={columns}
          getRowId={(row) => row.id}
          edit={{ enabled: true, onSave: jest.fn() }}
          detail={{ enabled: false }}
          rowActions={(row, controls) => (
            <button
              type="button"
              data-testid="row-action"
              data-pending={String(controls.hasPendingEdits)}
              onClick={controls.discardPendingEdits}
            >
              Confirm {row.name}
            </button>
          )}
        />,
      );
    });

    act(() => {
      host.querySelector<HTMLButtonElement>('button[title="Click to edit"]')?.click();
    });
    const input = host.querySelector<HTMLInputElement>('input[value="Original"]');
    expect(input).not.toBeNull();

    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "Corrected");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    const action = host.querySelector<HTMLButtonElement>(
      '[data-testid="row-action"]',
    );
    expect(action?.textContent).toBe("Confirm Corrected");
    expect(action?.dataset.pending).toBe("true");
    expect(host.textContent).toContain("1 unsaved change");

    act(() => action?.click());

    expect(action?.textContent).toBe("Confirm Original");
    expect(action?.dataset.pending).toBe("false");
    expect(host.textContent).not.toContain("unsaved change");
  });
});
