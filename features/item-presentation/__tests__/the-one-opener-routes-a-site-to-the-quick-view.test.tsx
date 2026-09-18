/**
 * 🚨 F-87 — CLICKING A SITE OPENS THE SITE QUICK VIEW, NOT A SECOND SITE SCREEN.
 *
 * `useOpenItemPresentation` is THE ONE opener every door goes through. A
 * registered type either reaches a bespoke window (agent, note, file, structured
 * list) or the Detail primitive. A site HAS a bespoke window already — the
 * floating Quick view the Sites portfolio and the Content Plan list open on a
 * row (`SitePeekWindow`) — so the door must reach THAT, wrapped for an id-only
 * caller, rather than composing a second site screen from the record's columns.
 *
 * RED before this change: `web_site` was not a known item type at all, so the
 * hook returned `false` and nothing opened. RED if someone later routes it to
 * the generic detail instead: this asserts which opener ran, not merely that one
 * did.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const openSiteQuickView = jest.fn();
const openDetail = jest.fn();

jest.mock("@/features/overlays/openers/siteQuickViewWindow", () => ({
  useOpenSiteQuickViewWindow: () => openSiteQuickView,
}));
jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => openDetail,
}));
jest.mock("@/features/overlays/openers/agentRunWindow", () => ({
  useOpenAgentRunWindow: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/noteInfoWindow", () => ({
  useOpenNoteInfoWindow: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/filePreviewWindow", () => ({
  useOpenFilePreviewWindow: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/structuredListManagerV2Window", () => ({
  useOpenStructuredListManagerV2Window: () => jest.fn(),
}));

import { useOpenItemPresentation } from "../useOpenItemPresentation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITE_ID = "38eff4c9-b021-451a-b995-7d9b3d17db5e";

let opened: boolean | null = null;

function Probe() {
  const open = useOpenItemPresentation();
  React.useEffect(() => {
    opened = open("web_site", SITE_ID, { name: "Titanium Success" });
  }, [open]);
  return null;
}

describe("the one opener, asked to open a site", () => {
  beforeEach(() => {
    opened = null;
    openSiteQuickView.mockClear();
    openDetail.mockClear();
  });

  it("opens the canonical site Quick view with the id and the name it knows", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    // RED: `false` — `web_site` was not a known item type, so no door existed.
    expect(opened).toBe(true);
    expect(openSiteQuickView).toHaveBeenCalledWith({
      siteId: SITE_ID,
      siteLabel: "Titanium Success",
    });
    // NOT a second site screen composed from the row's columns.
    expect(openDetail).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
