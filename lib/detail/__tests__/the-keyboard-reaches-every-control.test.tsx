// 🚨 NEW-22 (VERIFY-U-P1-R4) — ESCAPE, THE ARROWS AND CMD+ENTER ANSWER FROM THE
// HEADER TOO.
//
// Reproduced at `01566c21`: the keyboard model was bound on `KeyboardRoot`, which
// wraps the BODY only — `titleNode` and `actions` are handed to the shell and
// render OUTSIDE it. Neither `WindowPanel` nor `SidePanelSurface` contains any
// keydown handling and the page shell is a `RouteHeader`, so on a desktop, with
// focus on the copy-id button, a presentation icon, the previous/next chevrons or
// the overflow trigger, Escape closed nothing in ALL THREE presentations. On a
// phone the docked and window presentations are a `vaul` Drawer, which handles
// Escape itself — which is exactly why this hid.
//
// The header is part of the detail, so the keystroke reaches the same handler:
// every slot the presentation fills carries the model, the body included. And the
// Cmd+Enter gap closes with it — a record with nothing to save SAYS so instead of
// swallowing a deliberate keystroke (law 4).

import * as React from "react";
import { act } from "react";

import { DetailWindowPresentation, DetailDockedPresentation, DetailPagePresentation } from "../presentations";
import type { DetailDockedShellProps, DetailPageShellProps, DetailWindowShellProps } from "../host";
import { instance, makePorts, mount, StubPageShell } from "./harness";

function StubWindowShell({ titleNode, actions, children }: DetailWindowShellProps) {
  return (
    <div data-stub-window-shell>
      <div data-header>
        {titleNode}
        {actions}
      </div>
      {children}
    </div>
  );
}

function StubDockedShell({ titleNode, actions, children }: DetailDockedShellProps) {
  return (
    <div data-stub-docked-shell>
      <div data-header>
        {titleNode}
        {actions}
      </div>
      {children}
    </div>
  );
}

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "file",
    id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
  }));

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

function focusable(container: HTMLElement, selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`No ${selector} in: ${container.innerHTML.slice(0, 600)}`);
  el.focus();
  return el;
}

/** The three desktop presentations, each with its own shell (the census). */
const HOSTS = [
  {
    name: "window",
    render: (onClose: () => void) => (
      <DetailWindowPresentation data={instance({ list: { items: refs(5), index: 2 } })} onClose={onClose} />
    ),
    shells: { Window: StubWindowShell },
  },
  {
    name: "docked",
    render: (onClose: () => void) => (
      <DetailDockedPresentation data={instance({ list: { items: refs(5), index: 2 } })} onClose={onClose} />
    ),
    shells: { Docked: StubDockedShell },
  },
  {
    name: "page",
    render: () => (
      <DetailPagePresentation data={instance({ list: { items: refs(5), index: 2 } })} />
    ),
    shells: { Page: StubPageShell },
  },
] as const;

describe("the keyboard model from a control in the header", () => {
  for (const host of HOSTS) {
    it(`closes the ${host.name} presentation on Escape pressed on the copy-id control`, () => {
      const onClose = jest.fn();
      const ports = makePorts({ shells: host.shells });
      const m = mount(host.render(onClose), ports);
      press(focusable(m.container, "[data-detail-copy-id]"), "Escape");
      if (host.name === "page") {
        // The page has no `onClose`: it leaves through the ONE guarded exit (D1).
        const home = ports.navigate.toRecordHome as jest.Mock;
        const back = ports.navigate.back as jest.Mock;
        expect(home.mock.calls.length + back.mock.calls.length).toBe(1);
      } else {
        expect(onClose).toHaveBeenCalledTimes(1);
      }
      m.unmount();
    });

    it(`moves between records from the ${host.name} header's own controls`, () => {
      const ports = makePorts({ shells: host.shells });
      const m = mount(host.render(() => {}), ports);
      press(focusable(m.container, "[data-detail-copy-id]"), "]");
      const moved =
        (ports.open as jest.Mock).mock.calls.length +
        (ports.navigate.toPage as jest.Mock).mock.calls.length;
      expect(moved).toBe(1);
      m.unmount();
    });
  }

  it("says there is nothing to save rather than swallowing Cmd+Enter", () => {
    const ports = makePorts({ shells: { Window: StubWindowShell } });
    const m = mount(HOSTS[0].render(() => {}), ports);
    press(focusable(m.container, "[data-detail-copy-id]"), "Enter", { metaKey: true });
    expect((ports.notify.error as jest.Mock).mock.calls.length + (ports.notify.success as jest.Mock).mock.calls.length).toBe(1);
    m.unmount();
  });
});
