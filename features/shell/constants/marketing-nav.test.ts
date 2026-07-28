import { MARKETING_PILLARS } from "@/features/marketing/lib/marketing-nav";
import { shellIconComponents } from "@/features/shell/shellIconMap";
import { primaryNavItems } from "./nav-data";

// Guards the shell Marketing menu against the pillar registry: every live route
// reachable from the nav, every coming-soon pillar collapsed to one placeholder,
// every icon registered. The body throws instead of using expect() — those
// assertions predate this wrapper and read fine as prose. The wrapper exists
// because top-level throws made Vitest fail to collect the file at all.
describe("marketing shell navigation", () => {
  it("matches the marketing pillar registry", () => {
    const marketingItem = primaryNavItems.find(
      (item) => item.label === "Marketing",
    );

    if (!marketingItem?.children) {
      throw new Error("Marketing shell navigation is missing");
    }

    const marketingChildren = marketingItem.children;
    const reservedHrefs = new Set(
      MARKETING_PILLARS.flatMap((pillar) =>
        pillar.entries
          .filter((entry) => entry.status === "coming-soon")
          .map((entry) => entry.href),
      ),
    );

    for (const pillar of MARKETING_PILLARS) {
      const visibleEntries = pillar.entries.filter((entry) => !entry.navHidden);
      const liveEntries = visibleEntries.filter(
        (entry) => entry.status !== "coming-soon",
      );

      if (liveEntries.length === 0) {
        const placeholders = marketingChildren.filter(
          (child) => child.label === pillar.label,
        );
        if (placeholders.length !== 1) {
          throw new Error(
            `${pillar.label} must have exactly one top-level coming-soon placeholder`,
          );
        }
        continue;
      }

      for (const entry of liveEntries) {
        if (!marketingChildren.some((child) => child.href === entry.href)) {
          throw new Error(
            `Live marketing route is missing from nav: ${entry.href}`,
          );
        }
      }
    }

    for (const child of marketingChildren) {
      if (!shellIconComponents[child.iconName]) {
        throw new Error(
          `Marketing nav icon is not registered: ${child.iconName} (${child.label})`,
        );
      }
      if (reservedHrefs.has(child.href) && child.group) {
        throw new Error(`Nested coming-soon route leaked into nav: ${child.href}`);
      }
    }
  });
});
