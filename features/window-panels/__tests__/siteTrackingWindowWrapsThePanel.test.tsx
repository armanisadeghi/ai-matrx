/**
 * 🚨 THE TRACKING WINDOW WRAPS THE CANONICAL PANEL (the window-panels law, U-M2).
 *
 * `SiteTrackingWindow` is the FRAME. Its body must be `SiteTrackingPanel` — the same component
 * the site's Integrations settings mounts — rendered `variant="bare"` so there is no second
 * border, background or padding around a component that carries its own chrome.
 *
 * Why a test and not a reading: a bespoke body here would be a second renderer of a VERDICT. The
 * Analytics section's second renderer cost 5× session counts and a "last 30 days" table that was
 * really the last few hours; a second tracking renderer would print a confident grade of a
 * container the live page does not use, because it is the reconciliation a copy always drops.
 *
 * RED when the panel is replaced by any hand-rolled body, and RED when `variant="bare"` is
 * dropped — both are asserted on the props the frame actually passes.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const panelProps: Array<Record<string, unknown>> = [];
const windowProps: Array<Record<string, unknown>> = [];

jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: (props: Record<string, unknown>) => {
    windowProps.push(props);
    return (
      <div data-testid="window-panel" data-overlay-id={String(props.overlayId ?? "")}>
        {props.children as React.ReactNode}
      </div>
    );
  },
}));

jest.mock("@/features/marketing/tracking/components/SiteTrackingPanel", () => ({
  SiteTrackingPanel: (props: Record<string, unknown>) => {
    panelProps.push(props);
    return <div data-testid="canonical-tracking-panel" />;
  },
}));

jest.mock("@/features/marketing/data/service", () => ({
  getSite: jest.fn(async () => ({ id: "site-1", domain: "clinic.example" })),
}));

jest.mock("@/features/marketing/data/hooks", () => ({
  marketingKeys: { site: (id: string) => ["marketing", "site", id] },
}));

jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  InlineQueryError: () => <div data-testid="query-error" />,
  LoadingSurface: () => <div data-testid="loading" />,
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { id: "site-1", domain: "clinic.example" },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// eslint-disable-next-line import/first -- after the mocks above
import SiteTrackingWindow from "@/features/window-panels/windows/marketing/SiteTrackingWindow";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  panelProps.length = 0;
  windowProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => {
    root.render(
      <SiteTrackingWindow
        isOpen
        onClose={jest.fn()}
        siteId="site-1"
        siteLabel="clinic.example"
      />,
    );
  });
}

describe("SiteTrackingWindow", () => {
  it("renders the CANONICAL panel as its body, not a bespoke copy", () => {
    render();
    expect(
      container.querySelector('[data-testid="canonical-tracking-panel"]'),
    ).not.toBeNull();
    expect(panelProps).toHaveLength(1);
    expect(panelProps[0].site).toEqual({ id: "site-1", domain: "clinic.example" });
  });

  it("🚨 passes variant=bare — the frame IS the chrome, so no second border", () => {
    render();
    expect(panelProps[0].variant).toBe("bare");
  });

  it("is bound to its overlay and carries a durable address (R35)", () => {
    render();
    expect(windowProps[0].overlayId).toBe("siteTrackingWindow");
    // `urlSyncId` is what puts the SUBJECT in the address, so `?panels=site_tracking:<siteId>`
    // resolves to this site rather than an empty frame.
    expect(windowProps[0].urlSyncId).toBe("site-1");
  });

  it("renders nothing at all when closed", () => {
    act(() => {
      root.render(
        <SiteTrackingWindow isOpen={false} onClose={jest.fn()} siteId="site-1" />,
      );
    });
    expect(container.textContent).toBe("");
    expect(panelProps).toHaveLength(0);
  });
});
