/**
 * 🚨 F-88 — THE SITE QUICK VIEW IS ONE PANEL, FROM LOADING TO LOADED.
 *
 * `SiteQuickViewWindow` is the `siteQuickViewWindow` overlay's window: an
 * id-only caller (a chat answer, a reference chip, a table cell) opens it, it
 * reads the enriched site row, and it shows the canonical Quick view content.
 *
 * RED on 306edaf2 (F-87): the window rendered an `overlayId`-bound
 * `WindowPanel` while the read was in flight and then returned
 * `SitePeekWindow` — a SECOND, standalone `WindowPanel` with no `overlayId` —
 * the moment the row resolved. The overlay-bound panel unmounted, so the
 * overlay no longer owned the window on screen: `onCollectData` (persistence),
 * the tray row and close-from-the-controller all applied to a panel that was
 * gone, and the chrome blinked while the lazy peek module loaded.
 *
 * This asserts the panel IDENTITY survives the transition — the same DOM node,
 * still bound to the same overlay, still answering `onCollectData` — not merely
 * that something rendered in both states.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { SiteListRow } from "@/features/marketing/types";

type CollectData = (() => Record<string, unknown>) | undefined;

const panelMounts: string[] = [];
let lastCollectData: CollectData;

jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({
    id,
    overlayId,
    title,
    onCollectData,
    children,
  }: {
    id: string;
    overlayId?: string;
    title?: string;
    onCollectData?: () => Record<string, unknown>;
    children?: React.ReactNode;
  }) => {
    lastCollectData = onCollectData;
    React.useEffect(() => {
      panelMounts.push(`${id}:${overlayId ?? "none"}`);
    }, [id, overlayId]);
    return (
      <div
        data-testid="window-panel"
        data-window-id={id}
        data-overlay-id={overlayId ?? ""}
        data-title={title ?? ""}
      >
        {children}
      </div>
    );
  },
}));

// The canonical content — asserted by presence only; its own rendering is the
// marketing suite's business.
jest.mock("@/features/marketing/components/sites/SitePeekBody", () => ({
  __esModule: true,
  default: ({ site }: { site: { id: string } }) => (
    <div data-testid="peek-body" data-site-id={site.id} />
  ),
}));

// F-106 deleted the two-list page-local panel host (`SitePeekWindow.tsx`)
// entirely — no shipped caller imported it once both list callers were
// switched to this same overlay. A regression that tries to reintroduce it
// here now fails at the module-resolution / type-check level, which is a
// stronger guard than a jest.mock of a module that no longer exists.

jest.mock("@/features/marketing/data/service", () => ({
  getSiteListRow: jest.fn(),
}));
jest.mock("@/features/marketing/data/hooks", () => ({
  marketingKeys: { site: (id: string) => ["marketing", "site", id] },
}));

let queryState: {
  data?: SiteListRow;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => queryState,
}));

import SiteQuickViewWindow from "@/features/window-panels/windows/marketing/SiteQuickViewWindow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITE_ID = "38eff4c9-b021-451a-b995-7d9b3d17db5e";

function row(): SiteListRow {
  // Only what the window itself reads; the body is mocked.
  return { id: SITE_ID, name: "Titanium Success" } as unknown as SiteListRow;
}

describe("the site Quick view window, from loading to loaded", () => {
  beforeEach(() => {
    panelMounts.length = 0;
    lastCollectData = undefined;
    queryState = { isError: false, error: null, refetch: () => {} };
  });

  it("keeps ONE overlay-bound panel — the same element, still collecting data", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SiteQuickViewWindow
          isOpen
          onClose={() => {}}
          siteId={SITE_ID}
          siteLabel="Titanium Success"
        />,
      );
    });

    const loadingPanel = container.querySelector('[data-testid="window-panel"]');
    expect(loadingPanel).not.toBeNull();
    expect(loadingPanel?.getAttribute("data-overlay-id")).toBe("siteQuickViewWindow");
    expect(container.querySelector('[data-testid="peek-body"]')).toBeNull();

    // The read resolves.
    queryState = { data: row(), isError: false, error: null, refetch: () => {} };
    await act(async () => {
      root.render(
        <SiteQuickViewWindow
          isOpen
          onClose={() => {}}
          siteId={SITE_ID}
          siteLabel="Titanium Success"
        />,
      );
    });

    // RED on 306edaf2: the overlay-bound panel was replaced by a standalone one.
    const loadedPanel = container.querySelector('[data-testid="window-panel"]');
    expect(loadedPanel).not.toBeNull();
    expect(loadedPanel).toBe(loadingPanel);
    expect(loadedPanel?.getAttribute("data-overlay-id")).toBe("siteQuickViewWindow");

    // The canonical content is what swapped in — inside that same panel.
    const body = container.querySelector('[data-testid="peek-body"]');
    expect(body).not.toBeNull();
    expect(loadedPanel?.contains(body!)).toBe(true);
    expect(body?.getAttribute("data-site-id")).toBe(SITE_ID);

    // Exactly one panel ever joined the window manager, under one identity.
    expect(panelMounts).toEqual(["site-quick-view-window:siteQuickViewWindow"]);

    // Persistence still answers after the load (F-87 lost this).
    expect(typeof lastCollectData).toBe("function");
    expect(lastCollectData?.()).toEqual({
      siteId: SITE_ID,
      siteLabel: "Titanium Success",
    });

    await act(async () => root.unmount());
    container.remove();
  });
});
