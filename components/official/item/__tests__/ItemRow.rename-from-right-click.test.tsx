/** @jest-environment jsdom */
// A Rename picked from a row's RIGHT-CLICK menu must open the inline editor. The v3 context
// menu closes through `onOpenChange(false)` and never fires Radix's `onCloseAutoFocus`, so a
// rename that waited for the latter set a flag and did nothing (2026-10-03, chat sidebar).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => false,
}));

// The v3 context menu's contract: run the picked entry, then report closed via onOpenChange.
// It does NOT call onCloseAutoFocus.
jest.mock("../ItemMenu", () => ({
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ItemContextMenu: ({
    config,
    children,
    onOpenChange,
  }: {
    config: () => { sections: { items: { id?: string; onSelect?: () => void; label?: string }[] }[] };
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      {children}
      <button
        data-testid="pick-rename"
        onClick={() => {
          const entry = config()
            .sections.flatMap((s) => s.items)
            .find((e) => e.label === "Rename");
          entry?.onSelect?.();
          onOpenChange?.(false);
        }}
      />
    </div>
  ),
}));

import { ItemRow } from "../ItemRow";

describe("ItemRow rename from the right-click menu", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  it("opens the inline editor", () => {
    act(() =>
      root.render(
        <ItemRow
          label="Okafor draft"
          sourceFeature="conversation"
          menu={() => ({
            sections: [
              {
                items: [
                  { id: "rename", label: "Rename", intent: "rename", onSelect: () => {} },
                ],
              },
            ],
          })}
          rename={{ value: "Okafor draft", onCommit: () => {} }}
        />,
      ),
    );
    expect(host.querySelector("input")).toBeNull();
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-testid="pick-rename"]')!.click();
      jest.runAllTimers();
    });
    expect(host.querySelector("input")).not.toBeNull();
  });
});
