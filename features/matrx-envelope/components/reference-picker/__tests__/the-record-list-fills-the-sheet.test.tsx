/**
 * The record list fills the picker — it never stops at a fixed height.
 *
 * THE DEFECT (G10A review, 2026-10-02, nightly clone, 375px): the phone sheet
 * showed about four records with half the sheet empty below them. The list was
 * capped at `max-h-56` (224px) — a size meant for popovers and table cells —
 * and the step it sat in did not grow into the sheet.
 *
 * jsdom does not lay out, so this proves the chain that makes it fill: from
 * the list up to the sheet's body, every box is `flex flex-col min-h-0`, the
 * list and each box between grow (`flex-1`), and the list carries no cap.
 * A popover / cell host (no `fill`) keeps its cap.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { File as FileIcon } from "lucide-react";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "https://server.example.test",
  useAppDispatch: () => () => undefined,
}));
jest.mock("@/features/scopes/hooks/useKindItems", () => ({
  useKindItems: () => ({
    items: Array.from({ length: 20 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      title: `G10A task ${i + 1}`,
      updatedAt: null,
    })),
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: () => undefined,
    error: null,
    reload: () => undefined,
    pageSize: 50,
  }),
}));
jest.mock("@/features/scopes/service/recordFacts", () => ({
  ...jest.requireActual("@/features/scopes/service/recordFacts"),
  fetchRecordFacts: jest.fn(async () => new Map()),
  fetchRecordCreatedAt: jest.fn(async () => new Map()),
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [], loading: false, error: null, refresh: () => undefined }),
}));

import { RecordStep } from "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody";
import { RecordReferencePicker } from "@/features/matrx-envelope/components/ReferenceTypeAdder";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

async function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, done: () => { act(() => root.unmount()); container.remove(); } };
}

describe("the record list in the reference picker", () => {
  it("fills the sheet: every box from the list to the sheet body flexes, nothing caps it", async () => {
    const { container, done } = await mount(
      <div data-testid="sheet-body" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RecordStep
          type={{ token: "task", label: "Task", family: "Work", Icon: FileIcon }}
          mode="insert"
          delivery="insert"
          onDeliveryChange={() => undefined}
          directiveClass="reference"
          onDirectiveClassChange={() => undefined}
          onBack={() => undefined}
          onBrowseFiles={() => undefined}
          onPickMany={() => undefined}
        />
      </div>,
    );
    const list = container.querySelector('[role="listbox"]')!;
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(20);
    expect(classes(list).filter((c) => c.startsWith("max-h-"))).toEqual([]);
    const sheet = container.querySelector('[data-testid="sheet-body"]')!;
    const chain: string[] = [];
    for (let el = list.parentElement; el && el !== sheet; el = el.parentElement) {
      const c = classes(el);
      if (!(c.includes("flex") && c.includes("flex-col") && c.includes("min-h-0") && c.includes("flex-1"))) {
        chain.push(el.getAttribute("class") ?? "(no class)");
      }
    }
    expect(chain).toEqual([]);
    expect(classes(list)).toEqual(expect.arrayContaining(["flex-1", "min-h-0"]));
    done();
  });

  it("in a popover or a cell, the list keeps its cap", async () => {
    const { container, done } = await mount(
      <RecordReferencePicker token="task" onPickMany={() => undefined} />,
    );
    expect(classes(container.querySelector('[role="listbox"]')!)).toContain("max-h-56");
    done();
  });
});
