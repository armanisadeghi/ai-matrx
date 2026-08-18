import { EDU_TOOLS } from "@/features/education/data/tools";
import { shellIconComponents } from "@/features/shell/shellIconMap";
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import {
  EDU_NAV_GROUPS,
  EDU_TOOL_NAV,
  eduToolHref,
} from "./education-nav";

// Guards the shell Education menu against the tool registry. The failure this
// prevents is the one that shipped: 16 built tools with no navigational path
// from the shell, reachable only by typing a URL. A tool added to EDU_TOOLS and
// forgotten here is now a red test, not a silently unreachable feature.
describe("education shell navigation", () => {
  it("covers every registered tool exactly once", () => {
    const registrySlugs = EDU_TOOLS.map((tool) => tool.slug).sort();
    const navSlugs = EDU_TOOL_NAV.map((entry) => entry.slug).sort();

    expect(navSlugs).toEqual(registrySlugs);
  });

  it("has no duplicate slugs", () => {
    const slugs = EDU_TOOL_NAV.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses only declared groups", () => {
    for (const entry of EDU_TOOL_NAV) {
      expect(EDU_NAV_GROUPS).toContain(entry.group);
    }
  });

  it("registers every icon it names in the shell icon map", () => {
    for (const entry of EDU_TOOL_NAV) {
      if (!shellIconComponents[entry.iconName]) {
        throw new Error(
          `Education nav icon is not registered: ${entry.iconName} (${entry.label})`,
        );
      }
    }
  });

  it("reaches every tool from the Education Hub shell item", () => {
    const educationItem = primaryNavItems.find(
      (item) => item.label === "Education Hub",
    );

    if (!educationItem?.children) {
      throw new Error("Education shell navigation is missing");
    }

    const hrefs = new Set(educationItem.children.map((child) => child.href));

    for (const tool of EDU_TOOLS) {
      const href = eduToolHref(tool.slug);
      if (!hrefs.has(href)) {
        throw new Error(
          `Education tool is unreachable from the shell: ${tool.name} (${href})`,
        );
      }
    }
  });
});
