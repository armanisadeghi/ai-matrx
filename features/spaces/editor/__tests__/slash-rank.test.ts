/** Round 27, D4: "/data" + Enter must insert "Database - Inline" (Notion ranks names before aliases). */
import { rankSlashItems } from "../slash-rank";

// The order and words of the real menu's items that match "data" / "table" / "page".
const items = [
  { title: "Text", aliases: ["paragraph"], group: "Basic blocks" },
  { title: "Page", aliases: ["page", "subpage"], group: "Basic blocks" },
  { title: "Table", aliases: ["table", "simple table"], group: "Basic blocks" },
  { title: "Table view", aliases: ["database", "inline", "table view"], group: "Database" },
  { title: "Board view", aliases: ["board", "kanban"], group: "Database" },
  { title: "Database - Inline", aliases: ["database", "database inline", "inline", "new table", "table"], group: "Database" },
  { title: "Database - Full page", aliases: ["database", "database full page", "full page", "new table"], group: "Database" },
  { title: "Link to page", aliases: ["link", "mention page"], group: "Basic blocks" },
];
const titles = (q: string) => rankSlashItems(items, q).map((i) => i.title);

describe("slash results, best match first", () => {
  it('"data" puts Database - Inline first', () => {
    expect(titles("data")[0]).toBe("Database - Inline");
    expect(titles("Data")).toEqual(["Database - Inline", "Database - Full page", "Table view"]);
  });
  it('"table" puts the simple table first, its group before the database group', () => {
    expect(titles("table")[0]).toBe("Table");
  });
  it('"page" puts Page first and still finds Link to page and Full page', () => {
    const t = titles("page");
    expect(t[0]).toBe("Page");
    expect(t).toEqual(expect.arrayContaining(["Link to page", "Database - Full page"]));
  });
  it("one heading per group: items of a group stay together", () => {
    const groups = rankSlashItems(items, "table").map((i) => i.group);
    expect(groups.filter((g, i) => i === 0 || g !== groups[i - 1])).toEqual([...new Set(groups)]);
  });
  it("no query keeps the menu's order", () => {
    expect(titles("")).toEqual(items.map((i) => i.title));
  });
});
