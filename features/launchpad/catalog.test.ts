import { buildUserLaunchpadCatalog, searchUserLaunchpad } from "./catalog";
import type { ShellNavItem } from "@/features/shell/constants/nav-data";

const baseItem = {
  iconName: "LayoutGrid",
  section: "primary",
} satisfies Pick<ShellNavItem, "iconName" | "section">;

describe("user Launchpad catalog", () => {
  it("derives destinations while excluding launcher self-links and action controls", () => {
    const items: ShellNavItem[] = [
      {
        ...baseItem,
        label: "Launchpad",
        href: "/launchpad",
      },
      {
        ...baseItem,
        label: "Documents",
        href: "/documents",
        dashboard: false,
        children: [
          {
            label: "Notes",
            href: "/notes",
            iconName: "NotebookPen",
            dashboard: true,
          },
          {
            label: "New document",
            href: "/documents/new",
            iconName: "Plus",
            actionItem: true,
            dashboard: true,
          },
          {
            label: "Documents window",
            href: "/documents",
            iconName: "AppWindow",
            panelAction: "open-files-panel",
            dashboard: true,
          },
        ],
      },
    ];
    const settings: ShellNavItem = {
      ...baseItem,
      label: "Settings",
      href: "/settings",
    };

    const groups = buildUserLaunchpadCatalog(items, settings);

    expect(groups.map((group) => group.href)).toEqual([
      "/documents",
      "/settings",
    ]);
    expect(groups[0]?.destinations.map((item) => item.href)).toEqual([
      "/documents",
      "/notes",
    ]);
  });

  it("ranks title matches above group and description matches", () => {
    const results = searchUserLaunchpad("research", [
      {
        id: "/one",
        label: "Topic workspace",
        href: "/one",
        iconName: "FlaskConical",
        groupLabel: "Research",
        kind: "destination",
      },
      {
        id: "/two",
        label: "Research",
        href: "/two",
        iconName: "FlaskConical",
        groupLabel: "Knowledge",
        kind: "destination",
      },
    ]);

    expect(results.map((item) => item.href)).toEqual(["/two", "/one"]);
  });
});
