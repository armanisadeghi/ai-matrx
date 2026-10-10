/**
 * EVERY STATIC PAGE UNDER /data HAS A DOOR IN THE DATA MENU (or a named reason it does not).
 *
 * Lane ROUTES-AND-MENUS, 2026-10-08: /data/dashboards and /data/pages shipped as list pages with no
 * menu row and almost no in-app link, and /start (a person's own start page) was reachable only
 * from a page screen. A new page under /data now fails here until it gets a Data menu row or a
 * line below saying where its door is.
 *
 * 2026-10-09 (Arman: "pages and things like that cannot be in Data"): /data/pages and
 * /data/dashboards (and Make) moved to the Workspace menu; their door is there, never in Data.
 *
 * RED when: a static `app/(core)/data/<segment>/page.tsx` exists whose `/data/<segment>` is not a
 * Data or Workspace menu row and not in LINK_ONLY; Pages, Dashboards or Make reappear in Data or
 * leave Workspace; or /start leaves the Workspace menu.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DATA_NAV_CHILDREN, primaryNavItems, type ShellNavChild } from "../constants/nav-data";

const ROOT = path.resolve(__dirname, "../../..");
/** Arman, 2026-10-09: pages, dashboards and Make are places a person works, never "Data". */
const WORKSPACE_NOT_DATA = ["/data/pages", "/data/dashboards", "/make"] as const;

const DATA_DIR = path.join(ROOT, "app/(core)/data");

/** Static /data pages deliberately reached by a link, not a menu row — each names its door. */
const LINK_ONLY: Record<string, string> = {
  "/data/connect": "the Make hub's Connect a database tile and Settings > Integrations",
};

function everyChild(children: ShellNavChild[] | undefined): ShellNavChild[] {
  return (children ?? []).flatMap((c) => [c, ...everyChild(c.children as ShellNavChild[] | undefined)]);
}

function staticDataPages(): string[] {
  return readdirSync(DATA_DIR)
    .filter((name) => !name.startsWith("[") && !name.startsWith("_") && !name.startsWith("("))
    .filter((name) => statSync(path.join(DATA_DIR, name)).isDirectory())
    .filter((name) => existsSync(path.join(DATA_DIR, name, "page.tsx")))
    .map((name) => `/data/${name}`);
}

describe("every /data page has a menu door", () => {
  const doorsOf = (children: ShellNavChild[] | undefined) =>
    everyChild(children)
      .filter((c) => !c.panelAction && !c.actionItem && !c.action)
      .map((c) => c.href);
  const workspace = primaryNavItems.find((item) => item.label === "Workspace");
  const workspaceHrefs = new Set(doorsOf(workspace?.children as ShellNavChild[] | undefined));
  const dataHrefs = new Set([...doorsOf(DATA_NAV_CHILDREN), ...workspaceHrefs]);

  it("finds the static /data pages to check", () => {
    expect(staticDataPages()).toEqual(expect.arrayContaining(["/data/dashboards", "/data/pages"]));
  });

  it.each(staticDataPages().map((href) => [href] as const))("%s is a Data menu row or named link-only", (href) => {
    expect(dataHrefs.has(href) || href in LINK_ONLY).toBe(true);
  });

  it("no LINK_ONLY entry is stale", () => {
    const pages = new Set(staticDataPages());
    expect(Object.keys(LINK_ONLY).filter((href) => !pages.has(href))).toEqual([]);
  });

  it.each(WORKSPACE_NOT_DATA.map((href) => [href] as const))("%s is in Workspace and not in Data", (href) => {
    expect(workspaceHrefs.has(href)).toBe(true);
    expect(doorsOf(DATA_NAV_CHILDREN)).not.toContain(href);
  });

  it("the person's start page is in the Workspace menu", () => {
    expect(workspaceHrefs.has("/start")).toBe(true);
  });
});
