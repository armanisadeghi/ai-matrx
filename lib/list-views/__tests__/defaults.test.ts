import { LIST_VIEW_DEFAULTS, resolveListViewPrefs } from "../defaults";

// The forcing function here is the /work/conversations incident: the surface
// shipped a sort key ("updated") whose column was a row-mutation stamp sold as
// "Last activity". Fixing the surface is not enough if every existing user's
// stored blob keeps re-selecting the broken key.

describe("resolveListViewPrefs", () => {
  const stored = {
    version: 1,
    view: "cards" as const,
    density: "compact" as const,
    sort: "updated",
    direction: "asc" as const,
    favoritesFirst: false,
    hiddenColumns: [],
  };

  it("keeps a stale blob's sort when the surface declares none", () => {
    const out = resolveListViewPrefs({ version: 2 }, stored);
    expect(out.sort).toBe("updated");
    expect(out.direction).toBe("asc");
    // The choices that survive a shape change still survive it.
    expect(out.view).toBe("cards");
    expect(out.density).toBe("compact");
    expect(out.favoritesFirst).toBe(false);
    // The shape-tied choice is reset.
    expect(out.hiddenColumns).toEqual([]);
  });

  it("retires a stale blob's sort when the surface declares its own", () => {
    const out = resolveListViewPrefs(
      { version: 2, sort: "last_activity", direction: "desc" },
      stored,
    );
    expect(out.sort).toBe("last_activity");
    expect(out.direction).toBe("desc");
    // Only the sort axis is overridden — the rest still carries over.
    expect(out.view).toBe("cards");
    expect(out.favoritesFirst).toBe(false);
  });

  it("leaves a CURRENT-version blob entirely alone", () => {
    const current = { ...stored, version: 2 };
    const out = resolveListViewPrefs(
      { version: 2, sort: "last_activity" },
      current,
    );
    expect(out.sort).toBe("updated");
    expect(out.direction).toBe("asc");
  });

  it("falls back to the platform defaults with nothing stored", () => {
    const out = resolveListViewPrefs(undefined, undefined);
    expect(out).toEqual(LIST_VIEW_DEFAULTS);
  });
});
