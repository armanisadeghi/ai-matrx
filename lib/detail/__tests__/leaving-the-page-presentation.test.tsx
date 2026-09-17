// 🚨 D1 — SWITCHING A DETAIL PAGE TO A WINDOW NEVER STRANDS THE TAB.
//
// The reproduction (VERIFY-U-P1, 2026-09-17): open `/detail/file/<id>` in a
// fresh tab — the only way that route is ever reached, since nothing links to
// it — and click "Open as window". The window opened and `switchTo` then
// called `host.navigate.back()` into an EMPTY history, leaving the tab on
// `about:blank` with the whole app gone.
//
// These two cases are the fix: back only when this tab has somewhere to go
// back to, and otherwise a real destination.

import * as React from "react";

import { useDetailCore, type DetailCore } from "../core/useDetailCore";
import { clickByLabel, instance, makePorts, mount } from "./harness";

function Harness({ core }: { core: (c: DetailCore) => void }) {
  const c = useDetailCore(instance(), "page", { onClose: () => {} });
  core(c);
  return (
    <button type="button" aria-label="Open as window" onClick={() => c.switchTo("window")}>
      switch
    </button>
  );
}

describe("leaving the page presentation", () => {
  it("goes back when THIS tab pushed the page itself", () => {
    const ports = makePorts();
    (ports.navigate.canGoBack as jest.Mock).mockReturnValue(true);
    const m = mount(<Harness core={() => {}} />, ports);

    clickByLabel(m.container, "Open as window");

    expect(ports.open).toHaveBeenCalledWith(
      expect.objectContaining({ presentation: "window" }),
    );
    expect(ports.navigate.back).toHaveBeenCalledTimes(1);
    expect(ports.navigate.toRecordHome).not.toHaveBeenCalled();
    m.unmount();
  });

  it("goes to the record's own home when there is NOTHING behind the page", () => {
    const ports = makePorts();
    (ports.navigate.canGoBack as jest.Mock).mockReturnValue(false);
    const m = mount(<Harness core={() => {}} />, ports);

    clickByLabel(m.container, "Open as window");

    // The window is open either way — the person keeps the record.
    expect(ports.open).toHaveBeenCalledWith(
      expect.objectContaining({ presentation: "window" }),
    );
    // And the page is left for a destination that exists, NOT `back()`.
    expect(ports.navigate.back).not.toHaveBeenCalled();
    expect(ports.navigate.toRecordHome).toHaveBeenCalledWith(
      { type: "file", id: instance().id },
      "file",
    );
    m.unmount();
  });

  it("closes the in-place presentation, and never navigates, when switching FROM a window", () => {
    const ports = makePorts();
    function FromWindow() {
      const c = useDetailCore(instance(), "window", { onClose: () => {} });
      return (
        <button type="button" aria-label="Open as page" onClick={() => c.switchTo("docked")}>
          switch
        </button>
      );
    }
    const m = mount(<FromWindow />, ports);

    clickByLabel(m.container, "Open as page");

    expect(ports.open).toHaveBeenCalledWith(expect.objectContaining({ presentation: "docked" }));
    expect(ports.close).toHaveBeenCalledWith("window");
    expect(ports.navigate.back).not.toHaveBeenCalled();
    expect(ports.navigate.toRecordHome).not.toHaveBeenCalled();
    m.unmount();
  });
});
