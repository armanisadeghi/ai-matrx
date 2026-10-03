/**
 * A VALUE SITS UNDER THE PAGE THAT PRODUCED IT (owner ruling 2026-10-03).
 *
 * Use case: on the Knowledge page, a person opens a transcript ("Weekly vendor
 * sync") and asks the chat about it. The chip's full view showed
 * "Attached 26" holding Transcript Title, Is Draft, Playback Speed, All
 * Segments… — the transcript's own values, filed as if the person had
 * attached them, because the page in play (Knowledge) does not declare them.
 *
 * Now: each value carries the surface whose runtime published it; its row sits
 * under that surface's own section › page heading in its declared group, its
 * page layer and the person's rule are that surface's, and the request names
 * that surface for it in `context_surfaces` so the server files it the same
 * way. "Attached" holds only real attachments.
 *
 * Breaks this catches: the primary-only `declaredValue` lookup returning, a
 * mounted screen's value filed `_default`/attached, a rule saved under the
 * primary page governing the transcript's value, the request omitting where
 * the value sits, an unstamped entry losing the registry fallback.
 *
 * SUT: the real door (`buildRequestContext`) over the real registered
 * manifests (transcripts, knowledge) and the real placement.
 */

import type { ChatRootState } from "../../../../../store/root-state";
import { buildRequestContext, contextSurfacesFor, publishingPlace } from "../request-context";
import { placeContextRow } from "../context-hierarchy";

const KNOWLEDGE = "matrx-user/knowledge";
const TRANSCRIPTS = "matrx-user/transcripts";

type Entry = { key: string; value: unknown; surfaceName?: string };

function makeState(entries: Entry[], saved: Record<string, Record<string, unknown>> = {}): ChatRootState {
  const byKey: Record<string, unknown> = {};
  for (const e of entries) {
    byKey[e.key] = {
      key: e.key,
      value: e.value,
      slotMatched: false,
      type: "text",
      label: e.key,
      ...(e.surfaceName ? { surfaceName: e.surfaceName } : {}),
    };
  }
  return {
    conversations: { byConversationId: { c1: { agentId: "a1", surfaceName: KNOWLEDGE } } },
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
      byFeature: { context_rules: { status: "ready", error: null, fetchedAt: 1, rows: saved } },
    },
    messages: { byConversationId: { c1: { orderedIds: ["m1"] } } },
    instanceUIState: { byConversationId: {} },
  } as unknown as ChatRootState;
}

const TRANSCRIPT_ENTRIES: Entry[] = [
  { key: "transcript_title", value: "Weekly vendor sync", surfaceName: TRANSCRIPTS },
  { key: "transcript_is_draft", value: false, surfaceName: TRANSCRIPTS },
  { key: "playback_speed", value: 1.25, surfaceName: TRANSCRIPTS },
];

describe("a transcript open on the Knowledge page", () => {
  const door = buildRequestContext(makeState(TRANSCRIPT_ENTRIES), "c1", { includeAmbient: false });
  const row = (key: string) => door.rows.find((r) => r.key === key)!;

  it("files every transcript value under the Transcripts page, never as an attachment", () => {
    for (const key of ["transcript_title", "transcript_is_draft", "playback_speed"]) {
      expect(row(key).surfaceKey).toBe(TRANSCRIPTS);
      expect(row(key).origin).toBe("page");
    }
    expect(row("transcript_title").label).toBe("Active transcript title");
    expect(row("transcript_title").layers?.surface?.declared).toBe(true);
  });

  it("places them under the transcript page's own heading and group, beside the Knowledge page", () => {
    const place = placeContextRow(row("transcript_title"), KNOWLEDGE);
    expect(place.level.id).toBe(TRANSCRIPTS);
    expect(place.level.path.at(-1)).not.toBe("Attached");
    expect(place.group?.id).toBe(`${TRANSCRIPTS}:transcript_identity`);
  });

  it("names the surface each value sits under on the request, so the server files it the same way", () => {
    expect(door.context_surfaces).toEqual({
      transcript_title: TRANSCRIPTS,
      transcript_is_draft: TRANSCRIPTS,
      playback_speed: TRANSCRIPTS,
    });
  });

  it("reads the person's rule saved under the transcript page, never the Knowledge page's", () => {
    const ruled = buildRequestContext(
      makeState(TRANSCRIPT_ENTRIES, {
        [TRANSCRIPTS]: { transcript_title: { include: false } },
        [KNOWLEDGE]: { transcript_is_draft: { include: false } },
      }),
      "c1",
      { includeAmbient: false },
    );
    const r = (key: string) => ruled.rows.find((x) => x.key === key)!;
    expect(r("transcript_title").include).toBe(false);
    expect(r("transcript_title").decided_by.include).toBe("you");
    expect(r("transcript_is_draft").userRule).toBeNull();
    expect(ruled.context?.transcript_title).toBeUndefined();
    expect(ruled.context_withheld).toContain("transcript_title");
    // A withheld value still tells the server where it sits.
    expect(ruled.context_surfaces?.transcript_title).toBe(TRANSCRIPTS);
  });
});

describe("where a value sits when nobody stamped its page", () => {
  it("an entry written before stamping falls back to the one surface that authored it", () => {
    expect(publishingPlace({ key: "transcript_is_draft" }, KNOWLEDGE).surface).toBe(TRANSCRIPTS);
  });

  it("a real attachment stays Attached", () => {
    const door = buildRequestContext(
      makeState([{ key: "attached_document_4b1d", value: { content: "Q3 vendor review" } }]),
      "c1",
      { includeAmbient: false },
    );
    const attached = door.rows.find((r) => r.key === "attached_document_4b1d")!;
    expect(attached.surfaceKey).toBe("_default");
    expect(attached.origin).toBe("attached");
    expect(placeContextRow(attached, KNOWLEDGE).level.id).toBe("attached");
    expect(door.context_surfaces).toBeNull();
  });

  it("a sent turn's conversation id is the platform's, never an attachment", () => {
    // The receipt files the first turn's `conversation` client-sent under `_default`.
    expect(placeContextRow({ key: "conversation", surfaceKey: "_default", origin: "attached" }, KNOWLEDGE).level.id).toBe(
      "ai_matrx",
    );
  });

  it("the platform's own keys are never a page's value, whoever wrote them", () => {
    expect(publishingPlace({ key: "surface_chain", surfaceName: TRANSCRIPTS }, KNOWLEDGE).surface).toBeNull();
  });

  it("the primary's own declared values are not named again", () => {
    expect(
      contextSurfacesFor(
        [
          { key: "a", surfaceKey: KNOWLEDGE, origin: "page", layers: { surface: { declared: true } } },
          { key: "b", surfaceKey: KNOWLEDGE, origin: "page", layers: { surface: { declared: false } } },
        ] as never,
        KNOWLEDGE,
      ),
    ).toEqual({ b: KNOWLEDGE });
  });
});
