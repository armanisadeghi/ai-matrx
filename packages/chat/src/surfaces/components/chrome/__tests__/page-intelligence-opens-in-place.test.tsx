/**
 * A MANDATE OPENS IN PLACE — the Agents menu's "Page intelligence" rows.
 *
 * Blind run PB-03 (2026-10-01, /notes): "Notes Page Guide" under Page
 * intelligence was a <Link> to /intelligence/notes?mandate=notes.page_guidance,
 * so choosing it replaced the note the person was on. The law
 * (CLAUDE.md, agent-disclosure): a mandate opens IN PLACE through
 * useOpenMandateWindow; the full page is only a secondary door.
 *
 * Break it names: the row rendered as a link again → "the row is a button
 * that opens the mandate window" red; the secondary door removed → "the full
 * page stays reachable in a new tab" red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PageIntelligenceSection } from "../PageIntelligenceSection";

const openMandate = jest.fn();

jest.mock("../../../../host/navigation", () => {
  const ReactModule = require("react");
  return {
    usePathname: () => "/notes",
    Link: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) =>
      ReactModule.createElement("a", { href, ...rest }, children),
  };
});
jest.mock("../../../runtime/intelligence", () => ({
  declaredKeysForRoute: () => ["notes.page_guidance"],
  usePageIntelligenceDoors: () => [],
  declaredPlacesFor: () => null,
  featureIntelligenceHref: (_feature: string, opts: { mandateKey: string }) =>
    `/intelligence/notes?mandate=${opts.mandateKey}`,
  targetForKey: () => "notes",
}));
jest.mock("../../../runtime/surface-mandates", () => ({
  useLiveSurfaceMandates: () => [],
}));
jest.mock("../../../../mandates/service", () => ({
  fetchMandateIdentities: () =>
    Promise.resolve({ "notes.page_guidance": { label: "Notes Page Guide" } }),
}));
jest.mock("@host/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("../../../../host/window-openers", () => ({ ...jest.requireActual("../../../../host/window-openers"),
  useOpenMandateWindow: () => openMandate,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Page intelligence rows open the mandate in place", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openMandate.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("the row is a button that opens the mandate window", async () => {
    const onOpened = jest.fn();
    await act(async () => {
      root.render(<PageIntelligenceSection onOpened={onOpened} surfaceName="notes-editor" />);
    });
    const row = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Notes Page Guide"),
    );
    expect(row).toBeTruthy();
    expect(row?.closest("a")).toBeNull();
    act(() => row!.click());
    expect(openMandate).toHaveBeenCalledWith(
      expect.objectContaining({
        initialMandateKey: "notes.page_guidance",
        mandateKeys: ["notes.page_guidance"],
        surfaceName: "notes-editor",
      }),
    );
    expect(onOpened).toHaveBeenCalled();
  });

  it("the full page stays reachable in a new tab", async () => {
    await act(async () => {
      root.render(<PageIntelligenceSection />);
    });
    const link = host.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/intelligence/notes?mandate=notes.page_guidance");
    expect(link?.getAttribute("target")).toBe("_blank");
  });
});
