import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FileText } from "lucide-react";

import AdvancedMenu from "./AdvancedMenu";

jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** A host that owns the open state — exactly how every action bar mounts the menu. */
function Host() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <AdvancedMenu
        isOpen={open}
        onClose={() => setOpen(false)}
        showBackdrop={false}
        position="center"
        items={[{ key: "save", icon: FileText, label: "Save", action: () => {} }]}
      />
    </>
  );
}

describe("AdvancedMenu Escape (RC-B1 verify: setState during render)", () => {
  it("closes through the host without updating the host while the menu renders", async () => {
    const errors: string[] = [];
    const spy = jest.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    // StrictMode replays state updaters during render (as dev React does), so a
    // side effect hidden inside an updater surfaces deterministically here.
    await act(async () =>
      root.render(
        <StrictMode>
          <Host />
        </StrictMode>,
      ),
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("closed");
    expect(errors.filter((e) => e.includes("while rendering a different component"))).toEqual([]);

    await act(async () => root.unmount());
    container.remove();
    spy.mockRestore();
  });
});
