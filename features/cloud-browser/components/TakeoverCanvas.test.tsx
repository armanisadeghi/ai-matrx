/**
 * A live view that could not open must SAY so — never spin forever.
 *
 * 2026-09-13: taking control succeeded on the server, then minting the live-view
 * ticket was refused. The canvas treated "no ticket" as "still connecting" and
 * showed "Connecting to the live browser…" over "No live session" indefinitely,
 * while the only trace of the reason was a toast that had already vanished.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TakeoverCanvas } from "./TakeoverCanvas";
import type { ControllerState } from "../types";

jest.mock("../service", () => ({ renewStreamTicket: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const ME_DRIVING: ControllerState = {
  kind: "human",
  displayName: "Test Admin",
  isMe: true,
  controlRevision: 3,
  streamActive: true,
  pendingRequestFrom: null,
};

async function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
  return {
    text: () => container.textContent ?? "",
    hasSpinner: () => container.querySelector(".animate-spin") !== null,
    button: (label: string) =>
      Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes(label),
      ),
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("TakeoverCanvas", () => {
  it("shows the spinner only while it is actually connecting", async () => {
    const v = await render(
      <TakeoverCanvas controller={ME_DRIVING} ticket={null} connecting onReconnect={jest.fn()} />,
    );
    expect(v.hasSpinner()).toBe(true);
    expect(v.text()).toContain("Connecting to the live browser");
    await v.unmount();
  });

  it("a finished attempt with no ticket says why — no spinner, a way back", async () => {
    const v = await render(
      <TakeoverCanvas
        controller={ME_DRIVING}
        ticket={null}
        connecting={false}
        openError="This browser connection came from an unapproved site."
        onReconnect={jest.fn()}
      />,
    );
    expect(v.hasSpinner()).toBe(false);
    expect(v.text()).toContain("The live view could not open");
    expect(v.text()).toContain("unapproved site");
    expect(v.text()).toContain("You are still in control");
    expect(v.button("Reconnect")).toBeDefined();
    await v.unmount();
  });

  it("never spins on a finished attempt even when no reason was captured", async () => {
    const v = await render(
      <TakeoverCanvas controller={ME_DRIVING} ticket={null} connecting={false} onReconnect={jest.fn()} />,
    );
    expect(v.hasSpinner()).toBe(false);
    expect(v.text()).toContain("The live view could not open");
    await v.unmount();
  });
});
