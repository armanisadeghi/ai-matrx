/**
 * @jest-environment jsdom
 *
 * verify-RC-B9 F4: Enter on a focused message must OPEN its actions menu.
 * The message bar's trigger is a Radix DropdownMenu, which opens on
 * pointerdown/keydown — a bare `.click()` leaves it closed. This renders the
 * real primitive and proves the opener works on it AND on a plain click-based
 * trigger (the mobile sheet).
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openActions } from "../useMessageListInteractions";

jest.mock("@/features/agents/message-pins/pinned-messages-store", () => ({ togglePinnedMessage: jest.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(ui: React.ReactElement): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(ui);
  });
  return host.querySelector<HTMLElement>("[data-message-group]")!;
}

it("opens a Radix dropdown trigger", async () => {
  const group = await mount(
    <div data-message-group="">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="More actions">⋯</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Pin message</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>,
  );
  await act(async () => {
    expect(openActions(group)).toBe(true);
  });
  expect(group.querySelector('[aria-label="More actions"]')!.getAttribute("aria-expanded")).toBe("true");
  expect(document.body.textContent).toContain("Pin message");
});

it("still presses a click-based trigger", async () => {
  const onClick = jest.fn();
  const group = await mount(
    <div data-message-group="">
      <button type="button" aria-label="More options" onClick={onClick}>
        ⋯
      </button>
    </div>,
  );
  await act(async () => {
    expect(openActions(group)).toBe(true);
  });
  expect(onClick).toHaveBeenCalledTimes(1);
});
