/**
 * THE PAGE RULE (common-docs context-delivery RULES.md §0) — the client half.
 *
 * Arman, 2026-10-01, from the Model Battle page: the composer chip showed the
 * page switched OFF while every column's receipt said "Context 5 sent" —
 * Route Brief and Conversation among them. His ruling: the page's own
 * conversation (the main chat, the builder, every battle column) never knows
 * its route, its id, or the page; User, Client and Organization are ok. A chat
 * in a window over the page is not the page's own and keeps the page.
 *
 * SUT: `buildRequestContext` (the one door — the table's rows and the wire)
 * and the two fan-out primitives every multi-run path uses
 * (`copyInstanceRequestDraft`, `buildContinuationBody`). Doubles: the surface
 * manifest registry and the live provider registry's owner lookup.
 *
 * Breaks this catches: the own conversation sending its route or id; a
 * switched-off chip whose request still carries the route or no `page_context`
 * (the server, never told, describes the page); a fan-out copy re-reading the
 * page under a switched-off composer; a continuation turn dropping the rule;
 * the person's values being withheld with the page.
 */

import type { ChatRootState } from "../../../../../store/root-state";
import { buildPreviewRequestContext, buildRequestContext, pageContextFor } from "../request-context";
import { buildContinuationBody } from "../../utils/continuation-body";
import { copyInstanceRequestDraft } from "../../thunks/copy-instance-request-draft.thunk";

const owners: Record<string, string> = {};

jest.mock("../../../../../surfaces/runtime/SurfaceRuntimeContext", () => ({
  ...jest.requireActual("../../../../../surfaces/runtime/SurfaceRuntimeContext"),
  pageOwningConversation: (id: string | null | undefined) => (id ? (owners[id] ?? null) : null),
  isPageOwnConversation: (id: string | null | undefined) => Boolean(id && owners[id]),
}));

jest.mock("../../../../../surfaces/runtime/registry", () => ({
  // No surface authored the value (the registry fallback of `publishingPlace`).
  getDeclaringSurface: () => null,
  getManifest: (name: string) =>
    name === "matrx-user/agent-comparison-model"
      ? {
          values: [
            { name: "battle_columns", label: "Battle columns", description: "The columns" },
            { name: "organization", label: "Organization", description: "Declared by the page" },
          ],
        }
      : name === "matrx-user/route-aware"
        ? { values: [], ownConversationWithholds: ["conversation"] }
        : undefined,
}));

const BATTLE = "matrx-user/agent-comparison-model";

function firstTurnState(opts: {
  pageOff?: boolean;
  surfaceName?: string | null;
  entries?: Array<{ key: string; value: unknown }>;
}): ChatRootState {
  const byKey: Record<string, unknown> = {};
  for (const e of opts.entries ?? []) {
    byKey[e.key] = { key: e.key, value: e.value, slotMatched: false, type: "text", label: e.key };
  }
  return {
    conversations: {
      byConversationId: { c1: { agentId: "a1", surfaceName: opts.surfaceName ?? null } },
    },
    instanceContext: {
      byConversationId: { c1: byKey },
      surfaceKeysByConversationId: {},
      receiptByConversationId: {},
      expectedByConversationId: {},
    },
    instanceResources: { byConversationId: {} },
    agentDefinition: {
      agents: { a1: { id: "a1", contextPolicies: [], autoContextDisabled: false, _fetchStatus: "execution" } },
    },
    surfaceUserState: {
      byFeature: { context_rules: { status: "ready", error: null, fetchedAt: 1, rows: {} } },
    },
    messages: { byConversationId: { c1: { orderedIds: [], apiEndpointMode: "agent" } } },
    instanceUIState: {
      byConversationId: {
        c1: { builderAdvancedSettings: { surfaceOverride: opts.surfaceName ? undefined : BATTLE } },
      },
      pageContextOffByConversationId: opts.pageOff ? { c1: { previousSurfaceName: BATTLE } } : {},
    },
    userAuth: { id: "u1", email: "admin@admin.com" },
    userProfile: {},
    appContext: {
      scope_selections: {},
      organization_id: "c41f9e20-3a7d-4b15-8e62-91d0a4b7f3c8",
      organization_name: "Harbor Point",
    },
    // The package's own view of the active organization (P7), as the app keeps it.
    chatHost: { org: { id: "c41f9e20-3a7d-4b15-8e62-91d0a4b7f3c8", name: "Harbor Point" } },
  } as unknown as ChatRootState;
}

function rowsByKey(state: ChatRootState) {
  const built = buildRequestContext(state, "c1");
  return { ...built, row: (key: string) => built.rows.find((r) => r.key === key) };
}

afterEach(() => {
  for (const key of Object.keys(owners)) delete owners[key];
});

describe("a battle column — the page's own conversation", () => {
  it("never sends its route, its own id or the page's values; sends user, client and organization", () => {
    owners.c1 = BATTLE;
    const { context, context_withheld, page_context, row } = rowsByKey(
      firstTurnState({ entries: [{ key: "battle_columns", value: ["gpt", "claude"] }], surfaceName: null }),
    );
    for (const key of ["route_brief", "conversation"]) {
      expect(row(key)).toMatchObject({ include: false, delivery: "off", decided_by: { include: "page" } });
      expect(context?.[key]).toBeUndefined();
      expect(context_withheld).toContain(key);
    }
    expect(Object.keys(context ?? {}).sort()).toEqual(["client", "organization", "user"]);
    expect(page_context).toEqual({
      mode: "own",
      withheld: ["route_brief", "surface_chain", "window_forms", "surface_closed", "conversation"],
    });
  });

  it("a page that declares its own list overrides the default (the knob)", () => {
    owners.c1 = "matrx-user/route-aware";
    const { context, page_context } = rowsByKey(firstTurnState({}));
    expect(page_context).toEqual({ mode: "own", withheld: ["conversation"] });
    expect(context?.route_brief).toBeDefined();
    expect(context?.conversation).toBeUndefined();
  });
});

describe("a conversation whose page switch is off", () => {
  it("sends no route and tells the server the page is off; its id and the person still go", () => {
    const { context, page_context, row } = rowsByKey(firstTurnState({ pageOff: true }));
    expect(row("route_brief")).toMatchObject({ include: false, decided_by: { include: "page" } });
    expect(context?.route_brief).toBeUndefined();
    expect(context?.conversation).toBeDefined();
    expect(context?.user).toBeDefined();
    expect(page_context?.mode).toBe("off");
  });
});

describe("a window chat over the page — not its own conversation", () => {
  it("keeps the page: route and id go, and no page rule is sent", () => {
    const state = firstTurnState({});
    expect(pageContextFor(state, "c1")).toBeNull();
    const { context, page_context } = rowsByKey(state);
    expect(context?.route_brief).toBeDefined();
    expect(context?.conversation).toBeDefined();
    expect(page_context).toBeNull();
  });
});

describe("fan-out and follow-up turns keep the rule", () => {
  it("Submit All's copy carries the source chip's page switch to each column", () => {
    const dispatched: Array<{ type: string; payload: unknown }> = [];
    const state = {
      instanceUserInput: { byConversationId: { src: { text: "Draft a reply" } } },
      instanceVariableValues: { byConversationId: {} },
      instanceResources: { byConversationId: {}, handoffInheritedIds: {}, handoffRemovedIds: {} },
      instanceContext: { byConversationId: {} },
      instanceClientTools: { byConversationId: {} },
      instanceUIState: {
        byConversationId: {},
        pageContextOffByConversationId: { src: { previousSurfaceName: BATTLE } },
      },
      instanceModelOverrides: { byConversationId: {} },
      conversations: { byConversationId: { col: { surfaceName: BATTLE } } },
    };
    copyInstanceRequestDraft({ sourceConversationId: "src", targetConversationId: "col" })(
      ((action: { type: string; payload: unknown }) => dispatched.push(action)) as never,
      (() => state) as never,
      undefined,
    );
    const off = dispatched.find((a) => a.type.endsWith("setPageContextOff"));
    expect(off?.payload).toEqual({ conversationId: "col", previousSurfaceName: BATTLE });
    expect(dispatched.some((a) => a.type.endsWith("patchConversation"))).toBe(true);
  });

  it("a continuation turn forwards page_context", () => {
    const body = buildContinuationBody(
      { user_input: "next", page_context: { mode: "own", withheld: ["route_brief"] } },
      { retry: false, debug: false, cacheBypass: null },
    );
    expect(body.page_context).toEqual({ mode: "own", withheld: ["route_brief"] });
  });
});

describe("the context preview — what the agent will receive", () => {
  it("carries the same context, withheld keys and page rule a send of that conversation does", () => {
    // The client value stamps `now`; one instant for both reads.
    jest.useFakeTimers({ now: new Date("2026-10-01T18:00:00Z") });
    for (const [own, pageOff] of [
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      if (own) owners.c1 = BATTLE;
      else delete owners.c1;
      const state = firstTurnState({ pageOff, surfaceName: own ? null : BATTLE });
      const send = buildRequestContext(state, "c1");
      const preview = buildPreviewRequestContext(state, "c1");
      expect(preview.context).toEqual(send.context);
      expect(preview.context_withheld).toEqual(send.context_withheld);
      expect(preview.page_context ?? null).toEqual(send.page_context);
      expect(preview.surface).toBe(BATTLE);
    }
    jest.useRealTimers();
  });

  it("a battle column's preview names the page rule, so its receipt withholds route and id", () => {
    owners.c1 = BATTLE;
    const preview = buildPreviewRequestContext(firstTurnState({ surfaceName: null }), "c1");
    expect(preview.page_context?.mode).toBe("own");
    expect(preview.context?.route_brief).toBeUndefined();
    expect(preview.context?.conversation).toBeUndefined();
    expect(preview.context_withheld).toEqual(expect.arrayContaining(["route_brief", "conversation"]));
  });
});
