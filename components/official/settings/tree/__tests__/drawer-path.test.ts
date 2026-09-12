import type { SettingsTreeNode } from "../types";
import { getDrawerPathForActiveId } from "../types";

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
