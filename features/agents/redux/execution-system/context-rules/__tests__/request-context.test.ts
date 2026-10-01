/**
 * THE ONE DOOR — what the screen shows is what the request carries.
 *
 * Carries forward every wire promise the retired `withSurfaceInlineCeiling` /
 * `selectContextPayload` tests pinned (the person's pointer in full, the
 * page-less launch's content, a record with a `content` field is data, not an
 * envelope) and adds the rules system's own: a value the person turned off
 * never reaches the wire; the person's limit is NEVER sent as a page rule (the
 * server reads saved rules itself); the page's `autoContext: false` withholds;
 * the agent's kill switch withholds; the rows ARE the wire.
 */

import type { RootState } from "@/lib/redux/store";
import {
  ambientIncluded,
  buildRequestContext,
  buildResumeRequestContext,
  selectDisplayContextRows,
  selectResolvedContextRows,
} from "../request-context";

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: (name: string) =>
    name === "matrx-user/demo"
      ? {
          values: [
            { name: "record", label: "The record", description: "The note", inlineUpTo: 10000 },
            { name: "plain", label: "Plain value", description: "No ceiling" },
            { name: "hidden", label: "Hidden value", description: "Bindable only", autoContext: false },
            { name: "selection", label: "Current selection", description: "x" },
            // A first-turn SYSTEM value the page also declares — the live shape
            // of `conversation` on `matrx-user/chat` (inline up to 1000).
            { name: "conversation", label: "This conversation", description: "The chat", inlineUpTo: 1000 },
          ],
        }
      : undefined,
}));

type Entry = { key: string; value: unknown; type?: string; label?: string; slotMatched?: boolean };

function makeState(opts: {
  entries: Entry[];
  surfaceName?: string | null;
  saved?: Record<string, Record<string, unknown>>;
  policies?: Array<{ key: string; max_inline_chars?: number; label?: string }>;
  killSwitch?: boolean;
  agentFetchStatus?: "list" | "execution" | "full";
}): RootState {
  const byKey: Record<string, unknown> = {};
  for (const e of opts.entries) {
    byKey[e.key] = {
      key: e.key,
      value: e.value,
      slotMatched: e.slotMatched ?? false,
      type: e.type ?? "text",
      label: e.label ?? e.key,
    };
  }
  return {
    conversations: {
      byConversationId: {
        c1: { agentId: "a1", surfaceName: opts.surfaceName ?? null },
      },
    },
    instanceContext: {
      byConversationId: { c1: byKey },
      surfaceKeysByConversationId: {},
      receiptByConversationId: {},
      expectedByConversationId: {},
    },
    instanceResources: { byConversationId: {} },
    agentDefinition: {
      agents: {
        a1: {
          id: "a1",
          contextPolicies: (opts.policies ?? []).map((p) => ({ type: "text", ...p })),
          autoContextDisabled: opts.killSwitch ?? false,
          _fetchStatus: opts.agentFetchStatus ?? "execution",
        },
      },
    },
    surfaceUserState: {
      byFeature: {
        context_rules: { status: "ready", error: null, fetchedAt: 1, rows: opts.saved ?? {} },
      },
    },
    messages: { byConversationId: { c1: { orderedIds: ["m1"] } } },
    instanceUIState: { byConversationId: {} },
  } as unknown as RootState;
}

const build = (state: RootState) =>
  buildRequestContext(state, "c1", { includeAmbient: false });

describe("the page's limit and description", () => {
  it("a declared value with a page limit is sent as an envelope with that limit and the page's description", () => {
    const { context } = build(
      makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "record", value: { a: 1 }, type: "json" }] }),
    );
    expect(context?.record).toEqual({
      content: { a: 1 },
      type: "json",
      label: "The record",
      description: "The note",
      max_inline_chars: 10000,
    });
  });

  it("a record that merely has a content field is data, wrapped — never mistaken for an envelope", () => {
    const record = { id: "g1", title: "Cells", content: "# Cells" };
    const { context } = build(
      makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "record", value: record, type: "json" }] }),
    );
    expect(context?.record).toMatchObject({ content: record, max_inline_chars: 10000 });
  });

  it("the manifest's label replaces a raw key label", () => {
    const { rows } = build(
      makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "plain", value: "v" }] }),
    );
    expect(rows[0]?.label).toBe("Plain value");
    expect(rows[0]?.surfaceKey).toBe("matrx-user/demo");
    expect(rows[0]?.origin).toBe("page");
  });
});

describe("the person's pointer is always shown in full (Arman, 2026-09-30)", () => {
  it("a selection inlines up to 10,000 on any page and says the person is pointing at it", () => {
    const { context } = build(
      makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "selection", value: "x".repeat(4000) }] }),
    );
    const env = context?.selection as Record<string, unknown>;
    expect(env.max_inline_chars).toBe(10_000);
    expect(String(env.description)).toMatch(/pointing you at it/);
  });

  it("text before and after ride along up to 2,500, page or no page", () => {
    for (const surfaceName of ["matrx-user/demo", null]) {
      const { context } = build(
        makeState({
          surfaceName,
          entries: [
            { key: "text_before", value: "abc" },
            { key: "text_after", value: "abc" },
          ],
        }),
      );
      expect((context?.text_before as Record<string, unknown>).max_inline_chars).toBe(2_500);
      expect((context?.text_after as Record<string, unknown>).max_inline_chars).toBe(2_500);
    }
  });

  it("a launch with no page shows its whole content up to 6,000; a page keeps its own rule", () => {
    const pageless = build(makeState({ surfaceName: null, entries: [{ key: "content", value: "doc" }] }));
    expect((pageless.context?.content as Record<string, unknown>).max_inline_chars).toBe(6_000);
    const paged = build(makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "content", value: "doc" }] }));
    expect((paged.context?.content as Record<string, unknown>).max_inline_chars).toBeUndefined();
  });
});

describe("rules decide what reaches the wire", () => {
  it("a value the person turned off never reaches the wire, and its row says so", () => {
    const { rows, context } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [{ key: "plain", value: "v" }, { key: "record", value: "r" }],
        saved: { "matrx-user/demo": { plain: { include: false } } },
      }),
    );
    expect(context?.plain).toBeUndefined();
    expect(context?.record).toBeDefined();
    const row = rows.find((r) => r.key === "plain")!;
    expect(row).toMatchObject({ include: false, delivery: "off", decided_by: { include: "you" } });
  });

  it("the person's limit decides the row but is NEVER sent as a page rule", () => {
    const { rows, context } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [{ key: "plain", value: "v".repeat(5000) }],
        saved: { "matrx-user/demo": { plain: { max_inline_chars: 20000 } } },
      }),
    );
    expect(rows[0]).toMatchObject({ max_inline_chars: 20000, delivery: "inline", decided_by: { max_inline_chars: "you" } });
    expect((context?.plain as Record<string, unknown>).max_inline_chars).toBeUndefined();
  });

  it("a page's bindable-only value is withheld", () => {
    const { rows, context } = build(
      makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "hidden", value: "v" }] }),
    );
    expect(context).toBeUndefined();
    expect(rows[0]).toMatchObject({ include: false, decided_by: { include: "page" } });
  });

  it("the agent's kill switch withholds undeclared values and keeps declared ones", () => {
    const { context } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [{ key: "plain", value: "v" }, { key: "record", value: "r" }],
        policies: [{ key: "record" }],
        killSwitch: true,
      }),
    );
    expect(context?.plain).toBeUndefined();
    expect(context?.record).toBeDefined();
  });

  it("the person can re-admit a value past the kill switch", () => {
    const { context } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [{ key: "plain", value: "v" }],
        killSwitch: true,
        saved: { "matrx-user/demo": { plain: { include: true } } },
      }),
    );
    expect(context?.plain).toBeDefined();
  });

  it("a value no surface declares is keyed to the person's _default row", () => {
    const { rows, context } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [{ key: "note_id", value: "n1" }],
        saved: { _default: { note_id: { include: false } } },
      }),
    );
    expect(rows[0]).toMatchObject({ surfaceKey: "_default", origin: "attached", include: false });
    expect(context).toBeUndefined();
  });
});

describe("an attached file reaches the server as the reference it resolves", () => {
  it("ships a top-level resource reference exactly as-is, never wrapped", () => {
    const ref = { __kind: "resource_ref", resource_type: "file", resource_id: "f1" };
    const state = makeState({ entries: [] });
    (state as unknown as { instanceResources: unknown }).instanceResources = {
      byConversationId: {
        c1: {
          r1: {
            blockType: "processed_document",
            status: "ready",
            source: { file_id: "f1", filename: "Reference.pdf" },
            options: {},
          },
        },
      },
    };
    const { rows, context } = build(state);
    expect(rows[0]).toMatchObject({ key: "attached_file_f1", label: "Reference.pdf", origin: "attached" });
    expect(context?.attached_file_f1).toMatchObject(ref);
    expect((context?.attached_file_f1 as Record<string, unknown>).content).toBeUndefined();
  });
});

describe("the table and the send agree on the first turn's system values", () => {
  function firstTurn(apiEndpointMode: "agent" | "manual"): RootState {
    const state = makeState({ entries: [] }) as unknown as Record<string, unknown>;
    state.messages = { byConversationId: { c1: { orderedIds: [], apiEndpointMode } } };
    state.userAuth = { id: "u1", email: "admin@admin.com" };
    state.userProfile = {};
    state.appContext = { scope_selections: {} };
    return state as unknown as RootState;
  }

  it("an agent-door conversation's first turn shows AND sends them", () => {
    const state = firstTurn("agent");
    expect(ambientIncluded(state, "c1")).toBe(true);
    const shown = selectResolvedContextRows("c1")(state).map((r) => r.key);
    const sent = Object.keys(buildRequestContext(state, "c1").context ?? {});
    expect(shown).toEqual(expect.arrayContaining(["user", "client", "conversation"]));
    expect(sent.sort()).toEqual([...shown].sort());
  });

  it("the builder's manual door shows none and sends none (found live 2026-09-30)", () => {
    const state = firstTurn("manual");
    expect(ambientIncluded(state, "c1")).toBe(false);
    expect(selectResolvedContextRows("c1")(state)).toEqual([]);
    expect(buildRequestContext(state, "c1").context).toBeUndefined();
  });
});

describe("the table's rows are memoized on their inputs", () => {
  it("returns the same array until an input changes", () => {
    const state = makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "plain", value: "v" }] });
    const select = selectResolvedContextRows("c1");
    expect(select(state)).toBe(select(state));
    const changed = {
      ...state,
      surfaceUserState: {
        byFeature: {
          context_rules: {
            status: "ready",
            error: null,
            fetchedAt: 2,
            rows: { "matrx-user/demo": { plain: { include: false } } },
          },
        },
      },
    } as unknown as RootState;
    expect(select(changed)).not.toBe(select(state));
    expect(select(changed)[0]?.include).toBe(false);
  });
});

describe("values the server resolves itself are never predicted", () => {
  it("a UUID under a *_id key is server-resolved: no guessed size, and the wire sends it as-is", () => {
    const id = "6b0473b0-f6eb-40f7-8d3e-964e3681d645";
    const { rows, context } = build(
      makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "note_id", value: id }] }),
    );
    expect(rows[0]).toMatchObject({ serverResolved: true, chars: null, delivery: "server" });
    expect(context?.note_id).toBe(id);
  });
});

describe("the table displays the server's numbers for server-resolved values", () => {
  it("fills size, limit and delivery from the latest receipt (display only)", () => {
    const id = "effcbd12-a8ce-4c6f-b846-a219971c4391";
    const state = makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "note_id", value: id }] });
    (state as unknown as { instanceContext: Record<string, unknown> }).instanceContext.receiptByConversationId = {
      c1: {
        requestId: "r1",
        receivedAt: 1,
        receipt: {
          type: "context_receipt",
          version: 1,
          surface: "matrx-user/demo",
          cap: 50000,
          model_reads_context: true,
          rules_error: null,
          rows: [
            {
              key: "note_id",
              label: "Note Id",
              surface_key: "_default",
              origin: "client",
              chars: null,
              include: true,
              max_inline_chars: 0,
              delivery: "on_request",
              decided_by: { include: "default", max_inline_chars: "default" },
              user_rule: null,
              clamped: false,
              client_sent_excluded: false,
              blocked_by: null,
            },
          ],
        },
      },
    };
    const shown = selectDisplayContextRows("c1")(state);
    expect(shown[0]).toMatchObject({ fromReceipt: true, delivery: "on_request", max_inline_chars: 0 });
    // The send path still uses the unfilled rows.
    expect(buildRequestContext(state, "c1", { includeAmbient: false }).rows[0]?.delivery).toBe("server");
  });
});

describe("the person's rule holds whichever side files the value differently", () => {
  it("a rule saved under the page applies to a value the page does not declare (manifest drift)", () => {
    const { rows, context } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [{ key: "note_published", value: "yes" }],
        saved: { "matrx-user/demo": { note_published: { include: false } } },
      }),
    );
    expect(rows[0]).toMatchObject({ surfaceKey: "_default", include: false, decided_by: { include: "you" } });
    expect(context).toBeUndefined();
  });
});

// Break this catches: the client giving first-turn system values no page layer
// while the server applies the PRIMARY surface's (receipt seen live on the
// clone: `conversation` filed under `matrx-user/chat`, limit from the page) —
// every new chat went amber on its first turn.
describe("system values get the primary surface's page layer, as on the server", () => {
  function firstTurnOn(surfaceName: string | null): RootState {
    const state = makeState({ entries: [], surfaceName }) as unknown as Record<string, unknown>;
    state.messages = { byConversationId: { c1: { orderedIds: [], apiEndpointMode: "agent" } } };
    state.userAuth = { id: "u1", email: "admin@admin.com" };
    state.userProfile = {};
    state.appContext = { scope_selections: {} };
    return state as unknown as RootState;
  }

  it.each([
    ["conversation", "matrx-user/demo", 1000, "page", "This conversation"],
    ["user", "_default", 200, "default", "User"],
  ])("%s is filed under %s with limit %d decided by %s", (key, surfaceKey, limit, by, label) => {
    const { rows } = buildRequestContext(firstTurnOn("matrx-user/demo"), "c1");
    const row = rows.find((r) => r.key === key);
    expect(row).toMatchObject({
      surfaceKey,
      max_inline_chars: limit,
      decided_by: { max_inline_chars: by },
      label,
    });
  });

  it("with no page in play the same system value keeps the default layer", () => {
    const { rows } = buildRequestContext(firstTurnOn(null), "c1");
    expect(rows.find((r) => r.key === "conversation")).toMatchObject({
      surfaceKey: "_default",
      max_inline_chars: 200,
      decided_by: { max_inline_chars: "default" },
    });
  });
});

// Break this catches: the composer's table naming an unlabelled value one way
// and the server's receipt another. Both now use the package's one rule;
// expected strings are the shared corpus's `humanize_cases`
// (aidream apps/shared/matrx-agents/context/rules-corpus.json).
describe("an unlabelled key reads exactly as the server names it", () => {
  it.each([
    ["note_id", "Note ID"],
    ["current_note_published_to_web", "Current Note Published To Web"],
    ["source_url_pdf", "Source URL PDF"],
    ["url2pdf_source", "Url2pdf Source"],
    ["ai-model-settings", "AI Model Settings"],
  ])("%s → %s", (key, label) => {
    const { rows } = build(makeState({ entries: [{ key, value: "v" }] }));
    expect(rows[0]?.label).toBe(label);
  });

  it("a label someone wrote still wins", () => {
    const { rows } = build(makeState({ entries: [{ key: "note_id", value: "v", label: "Meeting notes" }] }));
    expect(rows[0]?.label).toBe("Meeting notes");
  });
});

// Break this catches: a send that tells the server nothing about the values the
// person's rules withheld, so the receipt lists every saved off-rule on every
// page instead of the ones withheld here.
describe("the request names what it withheld, from the same rows", () => {
  it.each([
    [{ "matrx-user/demo": { plain: { include: false } } }, ["plain"], ["selection"]],
    [{ "matrx-user/demo": { selection: { include: false } } }, ["selection"], ["plain"]],
    [{}, [], ["plain", "selection"]],
  ])("rules %j withhold %j and send %j", (saved, withheld, sent) => {
    const { context, context_withheld } = build(
      makeState({
        surfaceName: "matrx-user/demo",
        entries: [
          { key: "plain", value: "Quarterly planning notes" },
          { key: "selection", value: "the budget paragraph" },
        ],
        saved,
      }),
    );
    expect(context_withheld).toEqual(withheld);
    expect(Object.keys(context ?? {}).sort()).toEqual(sent);
  });
});

// Break this catches (F3): a document the SERVER attached to the turn (a
// conversation's durable file edge) reached the model but never appeared in
// the composer's table, so the person could neither see nor turn it off.
describe("values the server added are shown and governable", () => {
  const receiptRow = (key: string, label: string, origin: string, delivery: string) => ({
    key,
    label,
    surface_key: "_default",
    origin,
    chars: 18_400,
    include: true,
    max_inline_chars: 6000,
    delivery,
    decided_by: { include: "default", max_inline_chars: "default" },
    user_rule: null,
    clamped: false,
    client_sent_excluded: false,
    blocked_by: null,
  });
  function afterTurn(withExpected: boolean, withReceipt: boolean): RootState {
    const state = makeState({ surfaceName: "matrx-user/demo", entries: [{ key: "plain", value: "Standup notes" }] });
    const ctx = (state as unknown as { instanceContext: Record<string, unknown> }).instanceContext;
    const sent = build(state).rows.map((row) => ({ ...row, value: undefined }));
    if (withExpected) ctx.expectedByConversationId = { c1: { requestId: "r1", rows: sent } };
    if (withReceipt) {
      ctx.receiptByConversationId = {
        c1: {
          requestId: "r1",
          receivedAt: 1,
          receipt: {
            type: "context_receipt",
            version: 1,
            surface: "matrx-user/demo",
            cap: 50000,
            model_reads_context: true,
            rules_error: null,
            rows: [
              { ...receiptRow("plain", "Plain value", "client", "inline"), surface_key: "matrx-user/demo", chars: 13, max_inline_chars: 200 },
              receiptRow("attached_document_7d2e", "Harbor Dental vendor contract.pdf", "server", "on_request"),
              receiptRow("scope_client_name", "Client Name", "server", "inline"),
            ],
          },
        },
      };
    }
    return state;
  }

  it("lists each server-added value after the client's own, with its real name and surface key", () => {
    const shown = selectDisplayContextRows("c1")(afterTurn(true, true));
    expect(shown.map((r) => [r.key, r.label, r.surfaceKey, r.origin])).toEqual([
      ["plain", "Plain value", "matrx-user/demo", "page"],
      ["attached_document_7d2e", "Harbor Dental vendor contract.pdf", "_default", "attached"],
      ["scope_client_name", "Client Name", "_default", "system"],
    ]);
  });

  it("with no recorded request rows, still lists every value the client did not send", () => {
    const shown = selectDisplayContextRows("c1")(afterTurn(false, true));
    expect(shown.map((r) => r.key)).toEqual(["plain", "attached_document_7d2e", "scope_client_name"]);
  });

  it("a server-added value the person just turned off reads off at once, decided by them", () => {
    const state = afterTurn(true, true);
    (state as unknown as { surfaceUserState: { byFeature: Record<string, { rows: unknown }> } }).surfaceUserState.byFeature.context_rules.rows = {
      _default: { attached_document_7d2e: { include: false } },
    };
    const row = selectDisplayContextRows("c1")(state).find((r) => r.key === "attached_document_7d2e");
    expect(row).toMatchObject({ include: false, delivery: "off", decided_by: { include: "you" } });
  });

  it("shows only the client's rows before any receipt", () => {
    expect(selectDisplayContextRows("c1")(afterTurn(true, false)).map((r) => r.key)).toEqual(["plain"]);
  });

  it("never sends a server-added row", () => {
    const state = afterTurn(true, true);
    expect(Object.keys(buildRequestContext(state, "c1", { includeAmbient: false }).context ?? {})).toEqual(["plain"]);
  });
});

// Break this catches (R2-1): the door trusting an agent record from the LIST
// fetch, whose policies and kill switch were never read (defaults), so the
// table promised values the agent's real definition withholds.
describe("the agent's layer counts only from a record that read it", () => {
  it.each([
    ["execution", 50, "agent"],
    ["full", 50, "agent"],
    ["list", 200, "default"],
  ] as const)("a %s-fetched record gives limit %d decided by %s", (status, limit, by) => {
    const { rows } = build(
      makeState({
        entries: [{ key: "meeting_notes", value: "Standup: shipping the intake form" }],
        policies: [{ key: "meeting_notes", max_inline_chars: 50 }],
        agentFetchStatus: status,
      }),
    );
    expect(rows[0]).toMatchObject({ max_inline_chars: limit, decided_by: { max_inline_chars: by } });
  });
});

// Break this catches (F3, on load): a chat's durable attachments, which the
// server adds on every turn, missing from the chip after a reload until the
// next send — there is no live receipt yet, only the persisted one.
describe("on load, server-added values come from the last persisted receipt", () => {
  const persistedRow = (key: string, label: string, origin: string) => ({
    key,
    label,
    surface_key: "_default",
    origin,
    chars: 2400,
    include: true,
    max_inline_chars: 200,
    delivery: "on_request",
    decided_by: { include: "default", max_inline_chars: "default" },
    user_rule: null,
    clamped: false,
    client_sent_excluded: false,
    blocked_by: null,
  });
  function reloaded(): RootState {
    const state = makeState({ entries: [] }) as unknown as Record<string, unknown>;
    const receipt = (rows: unknown[]) => ({
      type: "context_receipt",
      version: 1,
      surface: "matrx-user/chat",
      cap: 50000,
      model_reads_context: true,
      rules_error: null,
      rows,
    });
    state.messages = {
      byConversationId: {
        c1: {
          orderedIds: ["u1", "a1", "u2", "a2"],
          byId: {
            u1: { role: "user", modelContext: { delivery: { receipt: receipt([persistedRow("resource_file_old", "last-years-menu.png", "server")]) } } },
            a1: { role: "assistant" },
            u2: {
              role: "user",
              modelContext: {
                delivery: {
                  receipt: receipt([
                    persistedRow("user", "User", "client"),
                    persistedRow("resource_file_a73a", "harbor-street-cost-sheet-q4.pdf", "server"),
                  ]),
                },
              },
            },
            a2: { role: "assistant" },
          },
        },
      },
    };
    return state as unknown as RootState;
  }

  it("lists the attachments of the LAST sent message, never values the client sent", () => {
    expect(selectDisplayContextRows("c1")(reloaded()).map((r) => [r.key, r.label])).toEqual([
      ["resource_file_a73a", "harbor-street-cost-sheet-q4.pdf"],
    ]);
  });
});

// Break this catches: resume forcing the first turn's system values on every
// resume (includeAmbient: true) — values the chip never showed for the turn.
describe("a resume sends exactly what the chip shows", () => {
  function conversation(orderedIds: string[]): RootState {
    const state = makeState({
      surfaceName: "matrx-user/demo",
      entries: [{ key: "plain", value: "Draft agenda for the Harbor Dental review" }],
    }) as unknown as Record<string, unknown>;
    state.messages = { byConversationId: { c1: { orderedIds, apiEndpointMode: "agent" } } };
    state.userAuth = { id: "u1", email: "admin@admin.com" };
    state.userProfile = {};
    state.appContext = { scope_selections: {} };
    state.activeRequests = { byConversationId: {}, byRequestId: {} };
    return state as unknown as RootState;
  }

  it.each([
    ["a later turn", ["m1", "m2"], ["plain"]],
    ["the first turn", [], expect.arrayContaining(["plain", "user", "client"])],
  ])("on %s", (_name, ids, keys) => {
    const state = conversation(ids as string[]);
    const resumed = buildResumeRequestContext(state, "c1", false).rows.map((r) => r.key);
    const shown = selectResolvedContextRows("c1")(state).map((r) => r.key);
    expect(resumed).toEqual(shown);
    expect(resumed).toEqual(keys);
  });
});
