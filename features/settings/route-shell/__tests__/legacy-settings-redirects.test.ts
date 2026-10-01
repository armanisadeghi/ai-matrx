/**
 * Every retired /settings/* address still lands on the setting it named.
 *
 * Links to the old pages are in sent email (feedback notify, user-review
 * notify, the HR digest), in access-request DM rows and in other repos, so the
 * config redirect table (utils/next-config/legacySettingsRedirects.js) is
 * permanent. This pins it to the registry: a tab added without a `?tab=`
 * redirect, a redirect to a tab that no longer exists, or an href that drifts
 * from `tabIdToHref` fails here by name.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { settingsRegistry } from "../../registry";
import { SETTINGS_BASE, tabIdToHref, urlToTabId } from "../routing";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const table = require("../../../../utils/next-config/legacySettingsRedirects.js") as {
  legacySettingsRedirects: {
    source: string;
    destination: string;
    permanent: boolean;
    has?: { type: string; key: string; value: string }[];
  }[];
  LEGACY_TAB_ALIASES: Record<string, string>;
  LEGACY_ROOT_TAB_OVERRIDES: Record<string, string>;
  REGISTRY_TAB_IDS: string[];
  LEGACY_PAGE_TABS: Record<string, string>;
  LEGACY_PAGE_ELSEWHERE: Record<string, string>;
  settingsTabHref: (id: string) => string;
};

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const registryIds = settingsRegistry.map((tab) => tab.id);

function destinationFor(source: string, tab?: string): string | undefined {
  return table.legacySettingsRedirects.find((rule) => {
    if (rule.source !== source) return false;
    const query = rule.has?.find((h) => h.type === "query" && h.key === "tab");
    if (!tab) return !query;
    return query ? new RegExp(query.value).test(tab) : false;
  })?.destination;
}

describe("legacy /settings redirects", () => {
  it("lists exactly the registry's tab ids", () => {
    expect([...table.REGISTRY_TAB_IDS].sort()).toEqual([...registryIds].sort());
  });

  it("builds every tab href exactly as the route does", () => {
    for (const id of registryIds) {
      expect(table.settingsTabHref(id)).toBe(tabIdToHref(SETTINGS_BASE, id));
    }
  });

  it.each(["/settings/preferences", "/settings"])("maps every ?tab= on %s", (source) => {
    // An old alias wins over a registry id of the same spelling, exactly as
    // the retired page resolved it (`?tab=voice` meant Voice input).
    const overrides = source === "/settings" ? table.LEGACY_ROOT_TAB_OVERRIDES : {};
    for (const id of registryIds.filter(
      (id) => !(id in table.LEGACY_TAB_ALIASES) && !(id in overrides),
    )) {
      expect(destinationFor(source, id)).toBe(tabIdToHref(SETTINGS_BASE, id));
    }
    for (const [legacy, id] of Object.entries({ ...table.LEGACY_TAB_ALIASES, ...overrides })) {
      expect(registryIds).toContain(id);
      expect(destinationFor(source, legacy)).toBe(tabIdToHref(SETTINGS_BASE, id));
    }
    expect(destinationFor(source)).toBe(SETTINGS_BASE);
    // The helper tray's "my computers" link.
    if (source === "/settings") {
      expect(destinationFor(source, "devices")).toBe("/user-settings/files/devices");
    }
    // A tab id that is a prefix of another must not swallow it.
    expect(destinationFor(source, "ai.models")).toBe("/user-settings/ai/models");
  });

  it("sends every retired page to a real tab, and no retired page still exists", () => {
    for (const [source, id] of Object.entries(table.LEGACY_PAGE_TABS)) {
      expect(registryIds).toContain(id);
      const destination = destinationFor(source);
      expect(destination).toBe(tabIdToHref(SETTINGS_BASE, id));
      expect(urlToTabId(destination!.replace(`${SETTINGS_BASE}/`, "").split("/"))).toBe(id);
    }
    for (const source of [
      ...Object.keys(table.LEGACY_PAGE_TABS),
      ...Object.keys(table.LEGACY_PAGE_ELSEWHERE),
    ]) {
      const segments = source.split("/").filter(Boolean);
      for (const group of ["(transitional)", "(core)"]) {
        expect(existsSync(path.join(ROOT, "app", group, ...segments, "page.tsx"))).toBe(false);
      }
    }
    expect(destinationFor("/settings/secrets")).toBe("/vault");
    expect(destinationFor("/settings/projects")).toBe("/projects");
  });

  it("never caches: /user-settings may be renamed back to /settings", () => {
    expect(table.legacySettingsRedirects.every((rule) => rule.permanent === false)).toBe(true);
  });
});
