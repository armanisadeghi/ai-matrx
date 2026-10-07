// N1 Tabs: the store boundary keeps tabs exactly, and heals shapes the database refuses.
import { validateSnapshot } from "@/lib/spaces-blocks/schema";
import { DEFAULT_PAGE_SETTINGS } from "@/lib/spaces-blocks/types";
import type { SpaceBlock } from "../../contract";
import { fromEngine, toEngine } from "../convert";
import { normalizeTabs, tabsAreWellFormed } from "../tabs";

const t = (text: string) => [{ text }];
const page: SpaceBlock[] = [
  {
    id: "tabs1",
    type: "tabs",
    props: { activeTab: "b" },
    children: [
      { id: "a", type: "tab", text: t("Overview"), children: [{ id: "p1", type: "text", text: t("first") }] },
      { id: "b", type: "tab", text: t("Notes"), children: [{ id: "p2", type: "todo", text: t("second"), props: { checked: true } }] },
    ],
  },
];
const valid = (blocks: SpaceBlock[]) => validateSnapshot({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: null, cover: null, blocks });

describe("tabs at the store boundary", () => {
  it("round-trips names, order, active tab and each tab's blocks", () => {
    const engine = toEngine(page);
    expect(engine[0].children?.map((c) => c.props?.name)).toEqual(["Overview", "Notes"]);
    expect(fromEngine(engine)).toEqual(page);
    expect(valid(page)).toEqual([]);
  });

  it("heals a block dropped straight into tabs and a tab left outside tabs", () => {
    const broken: SpaceBlock[] = [
      { id: "tabs1", type: "tabs", children: [{ id: "x", type: "text", text: t("stray") }, ...page[0].children!] },
      { id: "lone", type: "tab", text: t("Lone"), children: [{ id: "y", type: "text", text: t("kept") }] },
    ];
    expect(valid(broken).length).toBeGreaterThan(0);
    expect(tabsAreWellFormed(broken)).toBe(false);
    const healed = normalizeTabs(broken);
    expect(valid(healed)).toEqual([]);
    expect(healed[0].children![0].children!.map((c) => c.id)).toEqual(["x", "p1"]);
    expect(healed[1].id).toBe("y");
    expect(fromEngine(toEngine(broken))).toEqual(healed);
  });
});
