/**
 * Live UI audit of Applets, 2026-10-09 (lane F5). One guard per finding fixed on the host:
 *   L4 — an Applet shared with you has its own lane (Shared), and My Orgs is a lane; no My team.
 *   L9 — nobody sorts Applets by their About.   M8 — dates read to the minute, never the second.
 *   G5 — every module landing's bottom CTA keeps the destination like its hero; G3 — one card is centred.
 *   G6 — a signed-out person at a build link signs in and lands back on the build.
 *   G7 — a guest's top bar carries the brand and Sign in at every width.
 *   M6 — every page on the Overview opens; M7 — Settings uses THE controls' Tabs; M9 — Run sits below
 *   the header and changes pages in place.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APPLET_LIST_SCOPES, inLane, type AppletListRow } from "../browse/service";
import { appletListConfig } from "../browse/listConfig";
import { APPLET_COLUMNS } from "../browse/columns";
import { formatDateTime } from "../format";
import { appletState } from "../lib/applet-state";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const row = (over: Partial<AppletListRow>): AppletListRow =>
  ({
    id: "a",
    name: "A",
    is_mine: false,
    in_my_orgs: false,
    shown_to: null,
    is_public: false,
    published_to_web: false,
    state: appletState({ status: "draft", published_to_web: false }),
    ...over,
  }) as AppletListRow;

describe("L4 — the access ladder's lanes", () => {
  it("offers All, Mine, My Orgs, Shared and Public, and declares My team absent", () => {
    expect([...APPLET_LIST_SCOPES]).toEqual(["all", "mine", "orgs", "shared", "public"]);
    expect(appletListConfig.lanes).toEqual({ team: false });
  });
  it("an Applet shared with you is in Shared; your organization's is in My Orgs; a stranger's public one in neither", () => {
    const shared = row({});
    expect(inLane(shared, "shared")).toBe(true);
    expect(inLane(shared, "orgs")).toBe(false);
    const orgs = row({ in_my_orgs: true });
    expect(inLane(orgs, "orgs")).toBe(true);
    expect(inLane(orgs, "shared")).toBe(false);
    const stranger = row({ is_public: true });
    expect(inLane(stranger, "shared")).toBe(false);
    expect(inLane(stranger, "orgs")).toBe(false);
    expect(inLane(row({ is_mine: true }), "shared")).toBe(false);
  });
});

describe("L9 — the sorts a person uses", () => {
  it("About is not a sort", () => {
    expect(APPLET_COLUMNS.find((c) => c.id === "tagline")!.column.sortable).toBe(false);
  });
});

describe("M8 — a date reads to the minute", () => {
  it("never carries seconds", () => {
    const text = formatDateTime("2026-10-09T04:44:06Z");
    expect(text).not.toMatch(/:\d\d:\d\d/);
    expect(text).toMatch(/2026/);
  });
});

describe("module landings (G3, G5)", () => {
  const landing = source("features/auth/components/module-landing/ModuleLanding.tsx");
  it("the bottom CTA is the same destination-carrying link as the hero", () => {
    expect(landing).not.toMatch(/<Link href=\{primaryCtaHref\}>/);
    expect(landing.match(/<Link href=\{primaryCtaUrl\}>/g)).toHaveLength(2);
  });
  it("one sub-area card sits centred at a card's width", () => {
    expect(landing).toContain('subAreas.length === 1');
    expect(landing).toContain('"mx-auto max-w-md"');
  });
});

describe("G6 — a build link survives sign-in", () => {
  it.each(["app/(core)/applets/build/page.tsx", "app/(core)/applets/build/[id]/page.tsx"])("%s sends a guest to sign-in with the build as the destination", (file) => {
    const text = source(file);
    expect(text).not.toContain('redirect("/applets")');
    expect(text).toMatch(/redirect\(loginHref\(/);
  });
});

describe("G7 — a guest's top bar", () => {
  it("shows the brand and Sign in at every width", () => {
    const text = source("features/shell/components/header/GuestHeader.tsx");
    expect(text).not.toContain("md:hidden");
    expect(text).toContain("loginHref(pathname)");
  });
});

describe("manage (M6, M7, M9)", () => {
  it("M6 — a page opens at the Applet's own address; a one-record page says it opens from its list", () => {
    const text = source("features/applets/route/AppletOverviewContent.tsx");
    expect(text).toContain("Opens from its list");
    expect(text).toMatch(/<Link href=\{`\/applets\/\$\{app\.slug\}/);
  });
  it("M7 — Settings uses THE controls' Tabs, never the old ui/tabs", () => {
    const text = source("features/applets/route/AppletSettingsContent.tsx");
    expect(text).not.toContain("@/components/ui/tabs");
    expect(text).toMatch(/import \{[^}]*\bTabs\b[^}]*\} from "@ai-matrx\/design-system\/controls"/);
  });
  it("M9 — Run sits below the header and its pages change in place", () => {
    const text = source("app/(core)/applets/manage/[id]/run/page.tsx");
    expect(text).toContain("pt-[var(--shell-header-h)]");
    expect(text).toMatch(/<AppletHostMount[^>]*\bembedded\b/);
  });
});
