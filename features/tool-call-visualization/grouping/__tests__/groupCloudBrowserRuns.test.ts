import {
  collectCloudBrowserRun,
  groupCloudBrowserTurnFragments,
} from "../groupCloudBrowserRuns";

type Item = { id: string; kind: "browser" | "bridge" | "break" };

const item = (id: string, kind: Item["kind"]): Item => ({ id, kind });

describe("collectCloudBrowserRun", () => {
  test("thinking and short narration never split browser calls", () => {
    const items = [
      item("navigate", "browser"),
      item("thinking", "bridge"),
      item("aside", "bridge"),
      item("click", "browser"),
      item("more-thinking", "bridge"),
      item("screenshot", "browser"),
    ];

    const run = collectCloudBrowserRun(items, 0, (entry) => entry.kind);

    expect(run.browserItems.map((entry) => entry.id)).toEqual([
      "navigate",
      "click",
      "screenshot",
    ]);
    expect(run.bridgeItems.map((entry) => entry.id)).toEqual([
      "thinking",
      "aside",
      "more-thinking",
    ]);
    expect(run.nextIndex).toBe(items.length);
    expect(run.breakAfter).toBe(false);
  });

  test("a real content boundary starts a later browser run", () => {
    const items = [
      item("navigate", "browser"),
      item("thinking", "bridge"),
      item("answer", "break"),
      item("later-click", "browser"),
    ];

    const first = collectCloudBrowserRun(items, 0, (entry) => entry.kind);
    expect(first.browserItems.map((entry) => entry.id)).toEqual(["navigate"]);
    expect(first.bridgeItems.map((entry) => entry.id)).toEqual(["thinking"]);
    expect(first.nextIndex).toBe(2);
    expect(first.breakAfter).toBe(true);

    const second = collectCloudBrowserRun(items, 3, (entry) => entry.kind);
    expect(second.browserItems.map((entry) => entry.id)).toEqual([
      "later-click",
    ]);
  });

  test("refuses a non-browser starting point", () => {
    expect(() =>
      collectCloudBrowserRun(
        [item("thinking", "bridge")],
        0,
        (entry) => entry.kind,
      ),
    ).toThrow("must start on a browser item");
  });
});

describe("groupCloudBrowserTurnFragments", () => {
  test("merges uninterrupted fragments across assistant messages", () => {
    const groups = groupCloudBrowserTurnFragments([
      {
        id: "later",
        memberIndex: 1,
        order: 0,
        items: ["click", "screenshot"],
        breakBefore: false,
        breakAfter: false,
      },
      {
        id: "first",
        memberIndex: 0,
        order: 5,
        items: ["navigate"],
        breakBefore: false,
        breakAfter: false,
      },
    ]);

    expect(groups).toEqual([
      {
        primaryId: "first",
        fragmentIds: ["first", "later"],
        items: ["navigate", "click", "screenshot"],
        compact: false,
      },
    ]);
  });

  test("a later run is compact after a genuine boundary", () => {
    const groups = groupCloudBrowserTurnFragments([
      {
        id: "first",
        memberIndex: 0,
        order: 0,
        items: ["navigate"],
        breakBefore: false,
        breakAfter: true,
      },
      {
        id: "later",
        memberIndex: 2,
        order: 0,
        items: ["click"],
        breakBefore: false,
        breakAfter: false,
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].compact).toBe(false);
    expect(groups[1]).toMatchObject({ primaryId: "later", compact: true });
  });
});
