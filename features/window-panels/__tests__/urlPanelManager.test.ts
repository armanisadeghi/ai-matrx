import {
  mergeManagedPanelParams,
  parseParams,
  serializeParams,
  withUnclaimedTokens,
} from "../url-sync/UrlPanelManager";
import { resolveAgentPanelDisplayMode } from "../url-sync/initUrlHydration";
import { resolveWindowUrlSyncKey } from "../utils/urlSyncIdentity";

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

  it("restores agent URL panels to a real registered display mode", () => {
    expect(resolveAgentPanelDisplayMode(undefined)).toBe("floating-chat");
    expect(resolveAgentPanelDisplayMode("fc")).toBe("floating-chat");
    expect(resolveAgentPanelDisplayMode("flexible-panel")).toBe(
      "flexible-panel",
    );
    expect(resolveAgentPanelDisplayMode("not-a-display-mode")).toBe(
      "floating-chat",
    );
  });

  // 🚨 THE ADDRESS IS NEVER ERASED. Before 2026-09-19 a token whose window had
  // not registered was simply absent from the serialization, so the writer
  // replaced the URL with one that no longer held it: the link loaded, then
  // cleared itself, and the only copy of the address was gone.
  describe("a token the URL arrived with is never erased", () => {
    it("carries an unclaimed token through a write that knows nothing about it", () => {
      expect(
        withUnclaimedTokens("notes:default", [
          "agent:8b4bead9:m-flexible-panel",
        ]),
      ).toBe("agent:8b4bead9:m-flexible-panel,notes:default");
    });

    it("carries it even when no window is open at all", () => {
      expect(withUnclaimedTokens("", ["agent:8b4bead9:m-flexible-panel"])).toBe(
        "agent:8b4bead9:m-flexible-panel",
      );
    });

    it("yields to the window once that key registers, whatever identity it registers under", () => {
      // The vault LINK names an item; the vault WINDOW registers its singleton
      // id. Matching on the whole `typeKey:instanceId` would preserve the link
      // token forever, next to the window's own.
      expect(
        withUnclaimedTokens("vault:credentialVaultWindow", ["vault:item-123"]),
      ).toBe("vault:credentialVaultWindow");
    });

    it("leaves a param with nothing unclaimed exactly as it was", () => {
      expect(withUnclaimedTokens("notes:default", [])).toBe("notes:default");
    });
  });

  it("uses the registry URL key when a stale WindowPanel prop disagrees", () => {
    expect(
      resolveWindowUrlSyncKey("user_preferences", "userPreferencesWindow"),
    ).toBe("user_preferences");
    expect(resolveWindowUrlSyncKey(undefined, "page-local-window")).toBe(
      "page-local-window",
    );
  });
});
