/**
 * The banner is the whole affordance — if it renders the wrong control, the
 * takeover logic behind it never runs. These pin the four states that changed:
 * Take control is offered on ANY live run (not only inside a handoff window),
 * the wait notice replaces the banner and carries the escape, Request control
 * is its own action (it used to be an alias for Take), and the person driving
 * is told when someone is queued behind them.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ControllerBanner } from "./ControllerBanner";
import type { ControllerState } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_DRIVING: ControllerState = {
  kind: "agent",
  displayName: "Agent",
  isMe: false,
  controlRevision: 3,
  streamActive: false,
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
    container,
    buttons: () => Array.from(container.querySelectorAll("button")),
    button: (label: string) =>
      Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes(label),
      ),
    text: () => container.textContent ?? "",
    async click(label: string) {
      const btn = Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes(label),
      );
      if (!btn) throw new Error(`no button matching "${label}"`);
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const noop = () => {};

describe("ControllerBanner", () => {
  it("offers Take control while the agent drives — no handoff required", async () => {
    const onTake = jest.fn();
    const v = await render(
      <ControllerBanner
        controller={AGENT_DRIVING}
        onTake={onTake}
        onReturn={noop}
        canTake
      />,
    );
    expect(v.text()).toContain("The agent is driving.");
    await v.click("Take control");
    expect(onTake).toHaveBeenCalledTimes(1);
    await v.unmount();
  });

  it("shows the wait notice and the immediate escape while the agent is told", async () => {
    const onTakeImmediately = jest.fn();
    const onTake = jest.fn();
    const v = await render(
      <ControllerBanner
        controller={AGENT_DRIVING}
        onTake={onTake}
        onReturn={noop}
        canTake
        waitingForAgent
        onTakeImmediately={onTakeImmediately}
      />,
    );
    expect(v.text()).toContain("tell your agent you're taking over");
    // The wait REPLACES the banner's controls — never two ways to take over.
    expect(v.button("Take control")).toBeUndefined();
    await v.click("Take over immediately");
    expect(onTakeImmediately).toHaveBeenCalledTimes(1);
    expect(onTake).not.toHaveBeenCalled();
    await v.unmount();
  });

  it("Request control is its own action, not an alias for Take", async () => {
    const onTake = jest.fn();
    const onRequest = jest.fn();
    const v = await render(
      <ControllerBanner
        controller={{
          ...AGENT_DRIVING,
          kind: "human",
          isMe: false,
          displayName: "Dana",
        }}
        onTake={onTake}
        onReturn={noop}
        onRequest={onRequest}
        canTake
      />,
    );
    expect(v.text()).toContain("Dana is driving this browser.");
    expect(v.button("Take control")).toBeUndefined();
    await v.click("Request control");
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onTake).not.toHaveBeenCalled();
    await v.unmount();
  });

  it("tells the controller that someone is queued behind them", async () => {
    const v = await render(
      <ControllerBanner
        controller={{
          ...AGENT_DRIVING,
          kind: "human",
          isMe: true,
          displayName: "You",
          pendingRequestFrom: { userId: "u-2", displayName: "Dana" },
        }}
        onTake={noop}
        onReturn={noop}
      />,
    );
    expect(v.text()).toContain("Dana asked to take over");
    expect(v.button("Return control")).toBeDefined();
    await v.unmount();
  });
});
