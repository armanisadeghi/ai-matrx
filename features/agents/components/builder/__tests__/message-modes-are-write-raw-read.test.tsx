/**
 * Arman 2026-10-10: the agent builder's prompt boxes offer Write, Raw and Read,
 * not Split ("nowhere near big enough"). Toolbar + Insert menu: Write and Raw only.
 */
import React, { act } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MESSAGE_VIEW_MODE,
  MessageViewModeMenu,
  showsTextTools,
} from "@/features/agents/components/builder/message-builders/MessageViewModeMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("agent builder prompt box modes", () => {
  it("the open menu lists exactly Write, Raw, Read in that order", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(
        <TooltipProvider>
          <MessageViewModeMenu viewMode="plain" onChange={() => {}} />
        </TooltipProvider>,
      );
    });
    const trigger = host.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const labels = items.map((i) => i.querySelector("span")?.textContent);
    expect(labels).toEqual(["Write", "Raw", "Read"]);
  });
  it("opens in Raw until the default is flipped", () => {
    expect(DEFAULT_MESSAGE_VIEW_MODE).toBe("plain");
  });
  it("shows the toolbar and Insert menu in Write and Raw, not Read", () => {
    expect(showsTextTools("write")).toBe(true);
    expect(showsTextTools("plain")).toBe(true);
    expect(showsTextTools("edit")).toBe(true);
    expect(showsTextTools("preview")).toBe(false);
  });
});
