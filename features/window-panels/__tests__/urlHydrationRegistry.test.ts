import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import type { OverlayId } from "@/features/overlays/catalogue";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import { initUrlHydration } from "../url-sync/initUrlHydration";
import { getHydrator } from "../url-sync/UrlPanelRegistry";
import { PANEL_KEY_ALIASES } from "../url-sync/panelKeyAliases";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { agentPanelUrlArgs } from "../windows/agents/agentPanelSurfaceAddress";

jest.mock(
  "@/features/agents/redux/execution-system/thunks/load-conversation.thunk",
  () => ({
    loadConversation: jest.fn((args: { conversationId: string }) => ({
      type: "test/loadConversation",
      payload: args,
    })),
  }),
);

function hydrate(
  typeKey: string,
  instanceId: string,
  args: Record<string, string> = {},
) {
  const dispatch = jest.fn();
  const hydrator = getHydrator(typeKey);

  expect(hydrator).toBeDefined();
  hydrator?.(dispatch, instanceId, args);

  return dispatch;
}

describe("URL hydration registry", () => {
  beforeAll(() => {
    initUrlHydration();
  });

  it("has a hydrator for every registry urlSync key", () => {
    const missing = ALL_WINDOW_STATIC_METADATA.flatMap((entry) => {
      const key = entry.urlSync?.key;
      return key && !getHydrator(key)
        ? [{ overlayId: entry.overlayId, key }]
        : [];
    });

    expect(missing).toEqual([]);
  });

  it("opens the exact site's Analytics window from its durable address", () => {
    expect(hydrate("site_analytics", "site-42")).toHaveBeenCalledWith(
      openOverlay({
        overlayId: "siteAnalyticsWindow",
        data: { siteId: "site-42", siteLabel: null },
      }),
    );
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const dispatch = hydrate("site_analytics", "default");
      expect(dispatch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("names no site"));
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * V-29 NEW-1. An alias only works if BOTH halves are real: the alias key must
   * open something, and its canonical target must be a key some window actually
   * publishes. A dangling alias sends `UrlPanelManager` to wait on a key nothing
   * will ever register — which is exactly the red-tier false alarm the alias map
   * exists to end.
   */
  it("declares only aliases that are real in both directions", () => {
    const registryKeys = new Set(
      ALL_WINDOW_STATIC_METADATA.map((entry) => entry.urlSync?.key).filter(
        (key): key is string => Boolean(key),
      ),
    );

    const broken = Object.entries(PANEL_KEY_ALIASES).flatMap(
      ([aliasKey, canonicalKey]) => {
        const problems: string[] = [];
        if (!getHydrator(aliasKey)) problems.push("alias has no hydrator");
        if (!registryKeys.has(canonicalKey)) {
          problems.push(`no window publishes urlSync.key "${canonicalKey}"`);
        }
        if (registryKeys.has(aliasKey)) {
          problems.push("a window already publishes the alias key itself");
        }
        return problems.map((problem) => `${aliasKey}: ${problem}`);
      },
    );

    expect(broken).toEqual([]);
  });

  // 🚨 THE REPORTED DEFECT (2026-09-19). This token was in the address bar and
  // opened NOTHING: the hydrator seeded the conversation's display config and
  // never opened the shell that config describes, so no window ever registered
  // and the manager wiped the link back to the bare route.
  describe("an agent deep link opens the agent", () => {
    const CONVERSATION_ID = "8b4bead9-a20c-40cc-8b9e-3bc7e4df66f3";

    it("opens the shell the link's display mode names", () => {
      const dispatch = hydrate("agent", CONVERSATION_ID, {
        m: "flexible-panel",
      });

      expect(dispatch).toHaveBeenCalledWith(
        openOverlay({
          overlayId: "agentFlexiblePanel",
          instanceId: CONVERSATION_ID,
          data: { conversationId: CONVERSATION_ID },
        }),
      );
    });

    it("reads the conversation back out of the database", () => {
      // A floating panel is not a route: no page owns this conversation, and
      // the transcript deliberately never self-loads. If the hydrator does not
      // ask, the restored panel is an empty room that lies.
      hydrate("agent", CONVERSATION_ID, { m: "flexible-panel" });

      expect(jest.mocked(loadConversation)).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          expectMaterialized: true,
        }),
      );
    });

    it("never auto-runs the agent it reopens, and keeps the link's mode", () => {
      // Reopening an address is not a decision to spend a paid run. Both ride
      // in the SAME dispatch that stamps metadata.display, so no render can
      // see a stored autoRun before the correction lands.
      hydrate("agent", CONVERSATION_ID, { m: "flexible-panel" });

      expect(jest.mocked(loadConversation)).toHaveBeenCalledWith(
        expect.objectContaining({
          displayOverrides: {
            displayMode: "flexible-panel",
            autoRun: false,
          },
        }),
      );
    });

    // 🚨 2026-09-26 (/data-v2 side chat): a reload restored the window but not
    // its page binding, so the next turn went out with NO `context`. The token
    // carries the surface (`s-<surface>`) and the restore stamps it back once
    // the conversation is loaded — never before, or the DB record drops it.
    it("re-binds the page surface the link names, after the load", async () => {
      const dispatch = hydrate("agent", CONVERSATION_ID, {
        m: "flexible-panel",
        s: "matrx-user/data-tables",
      });
      await Promise.resolve();
      await Promise.resolve();
      const types = dispatch.mock.calls.map(([action]) => action?.type);
      expect(dispatch).toHaveBeenCalledWith(
        patchConversation({
          conversationId: CONVERSATION_ID,
          surfaceName: "matrx-user/data-tables",
        }),
      );
      expect(types.indexOf(patchConversation.type)).toBeGreaterThan(
        types.indexOf("test/loadConversation"),
      );
    });

    it("stamps nothing for an unbound link or a malformed surface", async () => {
      const cases: Record<string, string>[] = [
        { m: "flexible-panel" },
        { m: "fc", s: "not a surface" },
      ];
      for (const args of cases) {
        const dispatch = hydrate("agent", CONVERSATION_ID, args);
        await Promise.resolve();
        await Promise.resolve();
        expect(
          dispatch.mock.calls.some(
            ([action]) => action?.type === patchConversation.type,
          ),
        ).toBe(false);
      }
    });

    it("the shells write the binding into the address they mint", () => {
      expect(agentPanelUrlArgs("flexible-panel", "matrx-user/data-tables")).toEqual({
        m: "flexible-panel",
        s: "matrx-user/data-tables",
      });
      expect(agentPanelUrlArgs("fc", null)).toEqual({ m: "fc" });
    });

    it("falls back to the floating chat when the link names no mode", () => {
      expect(hydrate("agent", CONVERSATION_ID)).toHaveBeenCalledWith(
        openOverlay({
          overlayId: "agentFloatingChat",
          instanceId: CONVERSATION_ID,
          data: { conversationId: CONVERSATION_ID },
        }),
      );
    });

    it("reopens the Chat window as itself, not as a conversation shell", () => {
      // `agentRunWindow` shares the `agent` key but is a window that HOSTS
      // conversations; its `m-run` token carries the agent and the open chat.
      expect(
        hydrate("agent", "chat-window-1", {
          m: "run",
          a: "agent-7",
          c: "conv-9",
        }),
      ).toHaveBeenCalledWith(
        openOverlay({
          overlayId: "agentRunWindow",
          instanceId: "chat-window-1",
          data: {
            initialAgentId: "agent-7",
            initialSelectedConversationId: "conv-9",
          },
        }),
      );
    });

    it("opens nothing, loudly, for a token that names no conversation", () => {
      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const dispatch = jest.fn();
      getHydrator("agent")?.(dispatch, "default", {});
      expect(dispatch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("?panels=agent:default"),
      );
      warn.mockRestore();
    });
  });

  it("hydrates Creator Hub with an optional tab", () => {
    expect(hydrate("creator_hub", "creatorHub")).toHaveBeenCalledWith(
      openOverlay({ overlayId: "creatorHub", data: null }),
    );
    expect(hydrate("creator_hub", "routing")).toHaveBeenCalledWith(
      openOverlay({
        overlayId: "creatorHub",
        data: { initialTab: "routing" },
      }),
    );
  });

  it("hydrates Mandates without treating its singleton id as a mandate key", () => {
    expect(hydrate("mandate", "mandate-window")).toHaveBeenCalledWith(
      openOverlay({ overlayId: "mandateWindow", data: null }),
    );
    expect(hydrate("mandate", "education.fast-fire")).toHaveBeenCalledWith(
      openOverlay({
        overlayId: "mandateWindow",
        data: { initialMandateKey: "education.fast-fire" },
      }),
    );
  });

  it("hydrates a topic panel back onto its own (map, topic) pair", () => {
    // The instance id a real click mints — `topicPanelInstanceId` in
    // features/marketing/seo/topical-map/panel/topicPanelInstance.ts.
    expect(hydrate("topic", "8f1c2d3e-map|local-seo-for-dentists"))
      .toHaveBeenCalledWith(
        openOverlay({
          overlayId: "topicalMapTopicPanel",
          instanceId: "8f1c2d3e-map|local-seo-for-dentists",
          data: {
            stackIndex: 0,
            mapId: "8f1c2d3e-map",
            slug: "local-seo-for-dentists",
            siteId: null,
          },
        }),
      );
  });

  it("opens nothing, loudly, for a topic token with half an identity", () => {
    // OverlayController skips an instance with no map or no slug, so a panel
    // opened from "?panels=topic:8f1c2d3e-map" would be an invisible window in
    // the tray. It must refuse and say so instead.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const dispatch = jest.fn();
    getHydrator("topic")?.(dispatch, "8f1c2d3e-map", {});
    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("?panels=topic:8f1c2d3e-map"),
    );
    warn.mockRestore();
  });

  const structuredListCases: ReadonlyArray<readonly [string, OverlayId]> = [
    ["structuredListManagerV1", "structuredListManagerV1Window"],
    ["structuredListManagerV2", "structuredListManagerV2Window"],
  ];

  it.each(structuredListCases)(
    "hydrates %s without treating default as a list id",
    (typeKey, overlayId) => {
      expect(hydrate(typeKey, "default")).toHaveBeenCalledWith(
        openOverlay({ overlayId, data: null }),
      );
      expect(hydrate(typeKey, "list-123")).toHaveBeenCalledWith(
        openOverlay({ overlayId, data: { forcedListId: "list-123" } }),
      );
    },
  );
});
