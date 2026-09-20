/**
 * 🚨 THE BRAND CHANNEL WINDOW CARRIES ITS BRAND IN ITS ADDRESS (V-27 NEW-2), AND
 * WRAPS THE CANONICAL PANEL (the window-panels law, U-M3).
 *
 * WHAT SHIPPED. `?panels=brand_channel:<brandId>` opened the window once and the
 * URL then rewrote itself to `?panels=brand_channel%3AbrandChannelWindow`:
 * `WindowPanel` falls back to the singleton overlay id when no `urlSyncId` is
 * passed, and this window passed none. Reloading that address opened NOTHING —
 * the hydrator refuses a token that names no brand — so a person who shared the
 * link, or simply reloaded, silently lost the window. The registry row, the
 * `urlSync` key and the hydrator were all present and correct; only the SUBJECT
 * was missing, which is why the registry census could not see it.
 *
 * This is the twin of `siteTrackingWindowWrapsThePanel.test.tsx`, which asserts
 * the same three facts for the window that always did it right.
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

jest.mock("@/features/marketing/youtube/components/BrandChannelPanel", () => ({
  BrandChannelPanel: (props: Record<string, unknown>) => {
    panelProps.push(props);
    return <div data-testid="canonical-brand-channel-panel" />;
  },
}));

// eslint-disable-next-line import/first -- after the mocks above
import BrandChannelWindow from "@/features/window-panels/windows/marketing/BrandChannelWindow";

const BRAND_ID = "1c71e366-0000-4000-8000-000000000001";

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
      <BrandChannelWindow
        isOpen
        onClose={jest.fn()}
        brandId={BRAND_ID}
        brandLabel="AI Matrx"
      />,
    );
  });
}

describe("BrandChannelWindow", () => {
  it("🚨 puts the BRAND in its address, never the overlay id", () => {
    render();
    expect(windowProps[0].overlayId).toBe("brandChannelWindow");
    // The one line of the finding: without it the published token is
    // `brand_channel:brandChannelWindow`, which reopens nothing.
    expect(windowProps[0].urlSyncId).toBe(BRAND_ID);
  });

  it("renders the CANONICAL panel as its body, bare — no second chrome", () => {
    render();
    expect(
      container.querySelector('[data-testid="canonical-brand-channel-panel"]'),
    ).not.toBeNull();
    expect(panelProps[0].brandId).toBe(BRAND_ID);
    expect(panelProps[0].variant).toBe("bare");
  });

  it("renders nothing at all when closed", () => {
    act(() => {
      root.render(
        <BrandChannelWindow
          isOpen={false}
          onClose={jest.fn()}
          brandId={BRAND_ID}
        />,
      );
    });
    expect(container.querySelector('[data-testid="window-panel"]')).toBeNull();
  });
});
