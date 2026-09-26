/**
 * GUARD (defect D6) — the message ⋯ menu must FIT.
 *
 * The Actions group, with "Add to Rulebook" in it, once sat roughly twenty
 * rows below the last visible item: a reader auditing the menu concluded the
 * door did not exist, and a real user would too. A 600px desktop panel on a
 * 768px-tall viewport shows about seventeen 32px rows, so:
 *
 *   - every primary door is inside the first `MAX_VISIBLE_ROWS` rows, and
 *   - no group is stranded: the whole top level is at most that tall, with
 *     every remaining family behind a VISIBLE submenu trigger.
 *
 * This renders the REAL registry (RC-B6: the ONE rich-document registry the
 * chat bars render) through the REAL menu primitive — not a hand-made list.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

import AdvancedMenu, { type MenuItem } from "@/components/official/AdvancedMenu";
import "../../actions/handlers";
import { resolveActions } from "../../actions/provider";
import { chatContext } from "../../test-utils/chatContext";
import { toAdvancedMenuItems } from "../RegistryActionMenu";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

async function flushMenuPositioning() {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

/** 768px viewport → 600px panel → ~17 rows of 32px, minus the header. */
const MAX_VISIBLE_ROWS = 17;

/** The chat ⋯ menu rows for a role, exactly as RegistryActionMenu builds them. */
function menuItems(role: "assistant" | "user"): MenuItem[] {
  const ctx = chatContext(role);
  return toAdvancedMenuItems(resolveActions(ctx), ctx, () => ctx);
}

async function renderMenu(
  items: MenuItem[],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AdvancedMenu
        isOpen
        onClose={jest.fn()}
        showBackdrop={false}
        position="center"
        items={items}
        title="Message options"
      />,
    );
  });
  return {
    root,
    container,
    rows: () =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")),
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderAnchoredMenu(
  items: MenuItem[],
) {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  anchor.getBoundingClientRect = () =>
    ({
      top: 700,
      right: 420,
      bottom: 732,
      left: 388,
      width: 32,
      height: 32,
      x: 388,
      y: 700,
      toJSON: () => ({}),
    }) as DOMRect;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AdvancedMenu
        isOpen
        onClose={jest.fn()}
        showBackdrop={false}
        position="bottom-left"
        anchorElement={anchor}
        items={items}
        title="Message options"
      />,
    );
  });
  await flushMenuPositioning();

  return {
    root,
    anchor,
    container,
    rows: () =>
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button"),
      ).filter((button) => button !== anchor),
    panel: () =>
      document.body.querySelector<HTMLDivElement>(
        'div[style*="min-width: 280px"]',
      ),
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
      anchor.remove();
    },
  };
}

// Every menu leaves the page on teardown even when its test failed: a failed
// assertion used to skip `cleanup()`, and the next test then counted the
// leaked menu's rows too (36 "user" rows) and measured its panel.
afterEach(() => {
  document.body.innerHTML = "";
});

describe("message ⋯ menu fits a 768px-tall viewport (D6)", () => {
  it("puts Add to Rulebook in the visible region of the assistant menu", async () => {
    const menu = await renderMenu(menuItems("assistant"));
    const labels = menu.rows().map((row) => row.textContent ?? "");

    const index = labels.findIndex((label) => /Add to Rulebook/i.test(label));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(MAX_VISIBLE_ROWS);
    expect(labels.length).toBeLessThanOrEqual(MAX_VISIBLE_ROWS);

    await menu.cleanup();
  });

  it("keeps the user menu inside the visible region too", async () => {
    const menu = await renderMenu(menuItems("user"));
    const labels = menu.rows().map((row) => row.textContent ?? "");

    expect(labels.length).toBeLessThanOrEqual(MAX_VISIBLE_ROWS);
    expect(labels.some((label) => /Add to Rulebook/i.test(label))).toBe(true);

    await menu.cleanup();
  });

  it("keeps every Save as format reachable behind a visible submenu trigger", async () => {
    const menu = await renderMenu(menuItems("assistant"));

    const trigger = menu
      .rows()
      .find(
        (row) =>
          row.getAttribute("data-submenu-trigger") === "true" &&
          /Save as/i.test(row.textContent ?? ""),
      );
    expect(trigger).toBeTruthy();
    if (!trigger) throw new Error("Save as submenu trigger was not rendered");

    await act(async () => {
      trigger.click();
    });

    const labels = menu.rows().map((row) => row.textContent ?? "");
    expect(labels.some((label) => /PDF Document/i.test(label))).toBe(true);
    expect(labels.some((label) => /Markdown/i.test(label))).toBe(true);
    // The way back out is on screen.
    expect(labels.some((label) => /^Save as$/i.test(label.trim()))).toBe(true);

    await menu.cleanup();
  });

  it("keeps the desktop panel in place while drilling into a shorter submenu", async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        const text = this.textContent ?? "";
        return text.includes("Message options") ? 560 : 180;
      },
    });

    const menu = await renderAnchoredMenu(
      menuItems("assistant"),
    );
    const initialTop = menu.panel()?.style.top;
    expect(initialTop).toBe("132px");

    const trigger = menu
      .rows()
      .find(
        (row) =>
          row.getAttribute("data-submenu-trigger") === "true" &&
          /Save as/i.test(row.textContent ?? ""),
      );
    expect(trigger).toBeTruthy();
    if (!trigger) throw new Error("Save as submenu trigger was not rendered");

    await act(async () => {
      trigger.click();
    });
    await flushMenuPositioning();

    expect(menu.panel()?.style.top).toBe(initialTop);

    await menu.cleanup();
    if (originalScrollHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollHeight",
        originalScrollHeight,
      );
    } else {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
  });
});
