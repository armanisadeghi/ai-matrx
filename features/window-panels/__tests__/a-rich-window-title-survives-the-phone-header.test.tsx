/**
 * GUARD — a window's rich title (a control, e.g. the Chat window's agent
 * picker) survives the phone header (verifier round 1, F-A1).
 *
 * At 375px the Chat window's header held only the close dot and the
 * Sidebar/Content toggle: MobileWindowHeader turned a non-string title into the
 * word "Content", so "Select agent…" did not exist while the empty state said
 * "use the agent dropdown in the title bar".
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MobileWindowHeader } from "../WindowPanel/MobileHeader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(ui: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(ui);
  });
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MobileWindowHeader with a sidebar", () => {
  it.each(["main", "sidebar"] as const)("keeps a rich title control in the strip (%s pane)", (pane) => {
    const host = render(
      <MobileWindowHeader
        title={<button type="button">Select agent…</button>}
        hasSidebar
        activePaneMobile={pane}
        onSetActivePane={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(host.querySelector("button")?.textContent).toBeDefined();
    const picker = [...host.querySelectorAll("button")].find((b) => b.textContent === "Select agent…");
    expect(picker).toBeDefined();
    // Still one strip: the toggle is there too.
    expect(host.textContent).toContain("Sidebar");
  });

  it("a plain string title stays the toggle's own label, not a second copy", () => {
    const host = render(
      <MobileWindowHeader
        title="Notes"
        hasSidebar
        activePaneMobile="main"
        onSetActivePane={() => undefined}
      />,
    );
    expect(host.textContent?.match(/Notes/g)?.length).toBe(1);
  });
});
