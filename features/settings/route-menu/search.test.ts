import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import {
  findSettingsCategoryMatches,
  hasSettingsSearchResults,
} from "./search";

const nodes: SettingsTreeNode[] = [
  {
    id: "general",
    label: "General",
    children: [{ id: "general.language", label: "Language" }],
  },
];

describe("settings route search state", () => {
  it("keeps a category-only match reachable", () => {
    const categories = findSettingsCategoryMatches(nodes, "general");
    expect(categories.map((node) => node.id)).toEqual(["general"]);
    expect(hasSettingsSearchResults("general", [], categories)).toBe(true);
  });

  it("reports no result only when neither controls nor categories match", () => {
    expect(hasSettingsSearchResults("missing", [], [])).toBe(false);
  });
});
