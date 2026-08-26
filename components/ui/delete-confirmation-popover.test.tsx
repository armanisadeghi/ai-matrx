import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DeleteConfirmationPopover } from "@/components/ui/delete-confirmation-popover";

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" data-testid="menu-trigger">
        Menu trigger
      </button>
      <DeleteConfirmationPopover
        open={open}
        onOpenChange={setOpen}
        anchorPoint={{ x: 20, y: 20 }}
        title="Delete run?"
        itemLabel="A concise test run"
        description="Removed from Studio."
        onConfirm={() => undefined}
      />
    </>
  );
}

describe("DeleteConfirmationPopover", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  it("survives a dismissing menu restoring focus to its trigger", () => {
    act(() => root.render(<Harness />));
    act(() => jest.runOnlyPendingTimers());

    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-testid="menu-trigger"]',
    );
    expect(trigger).not.toBeNull();

    act(() => trigger?.focus());

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});
