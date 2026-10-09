/**
 * Live UI audit of Applets, 2026-10-09 (lane F4). One guard per finding fixed on the host:
 *   L1 — a new person's All lane is Mine ∪ My Orgs ∪ Shared, never strangers' public Applets; a
 *        maker's "Shown to: only me" (the regression fixture) hides it from everyone else's lists.
 *   L2 — About is a fixed, truncating column that leaves first; L6 — no second publication column.
 *   M2 — the Pages editor accepts the builder's relative addresses ("" is the home page).
 *   A1 — the archive confirm on a page names no list, and the
 *   toast after an archive carries Undo.  A2 / R4 — the words a stranger and a maker see at an address.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inLane, shownToViewer, type AppletListRow } from "../browse/service";
import { APPLET_COLUMNS } from "../browse/columns";
import { appletHeaderTransitions, archiveAppletFromPageSentence, appletState } from "../lib/applet-state";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

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

describe("L1 — the All lane follows the access ladder", () => {
  const strangersPublic = row({ is_public: true, published_to_web: true, state: appletState({ status: "published", published_to_web: true }) });
  it("a stranger's public Applet is in Public, never in All or Mine", () => {
    expect(inLane(strangersPublic, "all")).toBe(false);
    expect(inLane(strangersPublic, "mine")).toBe(false);
    expect(inLane(strangersPublic, "public")).toBe(true);
  });
  it("mine, my organizations' and a shared (readable, not public) Applet are all in All", () => {
    expect(inLane(row({ is_mine: true, is_public: true }), "all")).toBe(true);
    expect(inLane(row({ in_my_orgs: true, is_public: true }), "all")).toBe(true);
    expect(inLane(row({}), "all")).toBe(true);
  });
  it("Shown to: only me hides a row from everyone's lists but its maker's", () => {
    const fixture = { shown_to: "only_me", is_public: true };
    expect(shownToViewer(row(fixture))).toBe(false);
    expect(inLane(row(fixture), "public")).toBe(false);
    expect(inLane(row({ ...fixture, is_mine: true }), "public")).toBe(true);
    expect(shownToViewer(row({ shown_to: "everyone" }))).toBe(false);
    expect(shownToViewer(row({ shown_to: "everyone", in_my_orgs: true }))).toBe(true);
  });
});

describe("L2 / L6 — the list's columns", () => {
  it("About is fixed-width, truncates through TextCell and leaves first", () => {
    const about = APPLET_COLUMNS.find((c) => c.id === "tagline");
    expect(about?.column.width).toBe(320);
    expect(about?.column.maxWidth).toBe(360);
    expect(about?.priority).toBeGreaterThan(2);
  });
  it("Status is the only publication column — no 'On the web' beside 'Draft'", () => {
    expect(APPLET_COLUMNS.map((c) => c.id)).not.toContain("published_to_web");
  });
});

describe("L7 — the row menu opens the Applet's own page", () => {
  const src = readFileSync(join(__dirname, "../browse/useAppletRowActions.tsx"), "utf8");
  it("offers Manage (maker) / Details (others) to /applets/manage/<id>, or Continue building", () => {
    expect(src).toContain('label: row.is_mine ? "Manage" : "Details"');
    expect(src).toContain("href: appletManageHref(row)");
    expect(src).toContain('label: "Continue building"');
    expect(src).not.toContain('label: "Open", icon');
  });
});

describe("M1 — the manage header's publication presses follow the audience model", () => {
  const input = { name: "Reading List", slug: "reading-list" };
  const targets = (status: string, web: boolean) =>
    appletHeaderTransitions(appletState({ status, published_to_web: web }), input).map((t) => `${t.target}:${t.label}`);
  it("on the web: Take off the web leaves it In use; Stop using is the only way back to Draft", () => {
    expect(targets("published", true)).toEqual(["organization:Take off the web", "draft:Stop using"]);
    const [off, stop] = appletHeaderTransitions(appletState({ status: "published", published_to_web: true }), input);
    expect(off?.confirm.description).toContain("Your organization keeps using it");
    expect(stop?.confirm.description).toContain("goes back to a draft");
  });
  it("in use: Put on the web or Stop using; a draft: Put on the web", () => {
    expect(targets("published", false)).toEqual(["web:Put on the web", "draft:Stop using"]);
    expect(targets("draft", false)).toEqual(["web:Put on the web"]);
  });
  it("every non-primary press shows its name (never an unlabeled glyph)", () => {
    const src = readFileSync(join(__dirname, "../components/route-header/AppletHeader.tsx"), "utf8");
    expect(src).toContain("showLabel: !transition.primary");
    expect(src).not.toContain('"Unpublish"');
  });
});

describe("M2 — page addresses", () => {
  it("the builder's relative addresses are normal, duplicates are one address", async () => {
    const { pageAddressKey } = await import("../route/AppletRecordEditors");
    expect(pageAddressKey("")).toBe("");
    expect(pageAddressKey("/")).toBe("");
    expect(pageAddressKey("add")).toBe(pageAddressKey("/add"));
    expect(pageAddressKey("books/:id")).toBe("books/:id");
  });
  it("never shows another template's route as a hint", () => {
    const src = readFileSync(join(__dirname, "../route/AppletRecordEditors.tsx"), "utf8");
    expect(src).not.toContain("/clients/:id");
    expect(src).not.toContain("useJob.");
    expect(src).not.toContain("for useRows");
  });
});

describe("A1 — words on the manage page", () => {
  it("the archive confirm from Settings names where it comes back, never 'this list'", () => {
    const line = archiveAppletFromPageSentence("Reading List");
    expect(line).not.toMatch(/this list/);
    expect(line).toContain("Applets → Filters → Archived");
  });
  it("the toast after an archive carries Undo, which restores it", async () => {
    const { toastAppletArchived } = await import("../lib/archive-undo");
    const restore = jest.fn(async () => undefined);
    const onRestored = jest.fn();
    toastAppletArchived("app-1", "Reading List", { restore, onRestored });
    const [title, options] = toastSuccess.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(title).toBe('Archived "Reading List"');
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    await new Promise((r) => setTimeout(r, 0));
    expect(restore).toHaveBeenCalledWith("app-1");
    expect(onRestored).toHaveBeenCalled();
  });
});

describe("A2 / R4 — the Applet's own address", () => {
  it("an archived Applet says it is no longer available", async () => {
    const { APPLET_UNAVAILABLE_COPY } = await import("@/features/applets-host/AppletUnavailablePage");
    expect(APPLET_UNAVAILABLE_COPY.archived.title).toBe("This Applet is no longer available.");
  });
  it("a guest at an archived or unknown address is never sent to sign in", () => {
    const src = readFileSync(join(__dirname, "../../applets-host/resolve-applet-route.ts"), "utf8");
    expect(src).toContain('if (fate === "archived") return { kind: "gone" };');
    expect(src).toContain('if (fate === "none") return { kind: "missing" };');
  });
  it("its maker gets Back to AI Matrx, Manage and Change with AI", async () => {
    const { appletOwnerDoors } = await import("@/features/applets-host/AppletOwnerBar");
    expect(appletOwnerDoors("x").map((d) => d.href)).toEqual(["/applets", "/applets/manage/x", "/applets/manage/x/code"]);
  });
});

describe("G1 — a returning guest is not welcomed back", () => {
  it("never says 'Welcome back' to someone with no account", () => {
    const src = readFileSync(join(__dirname, "../../auth/components/conversion/ModuleLandingConversionNudges.tsx"), "utf8");
    expect(src).not.toContain("Welcome back");
    expect(src).not.toContain("picks up where you leave off");
  });
});
