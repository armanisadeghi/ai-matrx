import {
  mergeManagedPanelParams,
  parseParams,
  serializeParams,
} from "../url-sync/UrlPanelManager";

describe("UrlPanelManager URL helpers", () => {
  const entries = {
    "notes:default": {
      typeKey: "notes",
      instanceId: "default",
    },
    "keyword_research:keywordResearchWindow": {
      typeKey: "keyword_research",
      instanceId: "keywordResearchWindow",
    },
  };

  it("serializes only allowlisted entries for a route-scoped manager", () => {
    expect(serializeParams(entries, ["keyword_research"])).toBe(
      "keyword_research:keywordResearchWindow",
    );
  });

  it("preserves unmanaged panel tokens while replacing managed tokens", () => {
    expect(
      mergeManagedPanelParams(
        "notes:default,keyword_research",
        "keyword_research:keywordResearchWindow",
        ["keyword_research"],
      ),
    ).toBe("notes:default,keyword_research:keywordResearchWindow");
  });

  it("removes only the managed token when its panel closes", () => {
    expect(
      mergeManagedPanelParams(
        "notes:default,keyword_research:keywordResearchWindow",
        "",
        ["keyword_research"],
      ),
    ).toBe("notes:default");
  });

  it("retains the existing parser contract for bare singleton keys", () => {
    expect(parseParams("keyword_research")).toEqual([
      {
        typeKey: "keyword_research",
        instanceId: undefined,
        args: undefined,
      },
    ]);
  });
});
