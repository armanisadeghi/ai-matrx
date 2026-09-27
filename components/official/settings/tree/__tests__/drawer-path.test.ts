import type { SettingsTreeNode } from "../types";
import { flattenLeaves, getDrawerPathForActiveId } from "../types";

const nodes: SettingsTreeNode[] = [
  {
    id: "general",
    label: "General",
    children: [
      {
        id: "general.notifications",
        label: "Notifications",
      },
    ],
  },
];

describe("getDrawerPathForActiveId", () => {
  it("opens a directly linked leaf through its full mobile navigation path", () => {
    expect(getDrawerPathForActiveId(nodes, "general.notifications")).toEqual([
      "general",
      "general.notifications",
    ]);
  });

  it("starts at the settings root without a valid active id", () => {
    expect(getDrawerPathForActiveId(nodes, null)).toEqual([]);
    expect(getDrawerPathForActiveId(nodes, "missing")).toEqual([]);
  });
});

it("includes a folder with its own page among settings destinations", () => {
  const connectors: SettingsTreeNode = {
    id: "integrations",
    label: "Connectors",
    navigable: true,
    children: [{ id: "integrations.microsoft", label: "Microsoft" }],
  };

  expect(flattenLeaves([connectors]).map(({ id }) => id)).toEqual([
    "integrations",
    "integrations.microsoft",
  ]);
});
