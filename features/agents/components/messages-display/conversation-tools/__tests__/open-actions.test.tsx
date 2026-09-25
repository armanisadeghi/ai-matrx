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
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { Pin, Copy } from "lucide-react";
import { openActions } from "../useMessageListInteractions";

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

// jsdom has no ResizeObserver; the menu only uses it for its scroll fade.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

jest.mock("@/features/agents/message-pins/pinned-messages-store", () => ({ togglePinnedMessage: jest.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ unmount(): void }> = [];
afterEach(async () => {
  await act(async () => {
    roots.splice(0).forEach((r) => r.unmount());
  });
  document.body.innerHTML = "";
});

async function mount(ui: React.ReactElement): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    const root = createRoot(host);
    roots.push(root);
    root.render(ui);
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

/**
 * verify-RC-B9 round 2 F4: the USER message's "More options" opens the shared
 * AdvancedMenu (not Radix). Pressing it from the keyboard must land focus IN
 * a real menu the keyboard can drive — arrows move, Escape closes and returns
 * focus — exactly like the assistant's Radix menu. One behavior, every role.
 */
function UserBarHarness() {
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  return (
    <div data-message-group="" aria-label="Your message">
      <button type="button" ref={setAnchor} aria-label="More options" onClick={() => setOpen(true)}>
        ⋯
      </button>
      <AdvancedMenu
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorElement={anchor}
        title="Your message"
        items={[
          { key: "pin", icon: Pin, label: "Pin message", action: () => {} },
          { key: "copy", icon: Copy, label: "Copy text", action: () => {} },
        ]}
      />
    </div>
  );
}

async function frames(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

describe.each(["user message (AdvancedMenu)", "assistant answer (Radix)"])("keyboard opens %s", (role) => {
  it("opens a keyboard-drivable menu with focus inside it", async () => {
    const group =
      role.startsWith("user")
        ? await mount(<UserBarHarness />)
        : await mount(
            <div data-message-group="" aria-label="Assistant answer">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="More actions">⋯</DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Pin message</DropdownMenuItem>
                  <DropdownMenuItem>Copy text</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>,
          );
    await act(async () => {
      openActions(group);
    });
    await frames();
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toContain("Pin message");
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await frames(1);
    expect(document.activeElement?.textContent).toContain("Copy text");
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await frames();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/More (options|actions)/);
    document.body.innerHTML = "";
  });
});
