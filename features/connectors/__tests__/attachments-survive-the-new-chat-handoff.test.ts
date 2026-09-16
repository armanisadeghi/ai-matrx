/**
 * Guard: what you attached is still attached — after the send that creates the
 * conversation, and after a reload.
 *
 * Arman, 2026-09-15: "it should then persist but let me add others later."
 *
 * Two separate ways this class of feature dies, both of which have already
 * happened in this repo:
 *
 *  1. **The `/chat/new` handoff.** The composer renders against a conversation
 *     id minted in the browser; the row does not exist until the first send.
 *     A pick made in that window has nothing to POST to. Per-run tool and MCP
 *     additions were lost on exactly this boundary until 2026-09-14
 *     (6843361ca1) — the pick was discarded with no trace, and attaching a
 *     service is usually the FIRST thing a person does on a new chat.
 *  2. **The reload.** State that lives only in the browser reads as persistent
 *     for the length of one session and then is not.
 *
 * The SUT is the attachments slice's lifecycle. The service is mocked at the
 * transport boundary only — every decision about when a pick is held, when it
 * is sent, and what the user is left holding when a send fails is the real
 * code under test.
 *
 * Proven failing before passing: see the mutations recorded in the task report
 * (dropping the flush, and treating a failed read as an empty list).
 */

import { configureStore } from "@reduxjs/toolkit";
import attachmentsReducer, {
  attachResource,
  detachResource,
  loadConversationAttachments,
  flushPendingAttachments,
  selectConversationAttachmentsEntry,
} from "../redux/attachments.slice";
import {
  mergeAttachments,
  type ConversationAttachment,
  type PendingAttachment,
} from "../attachable-resources";

jest.mock("../attachments.service", () => ({
  fetchConversationAttachments: jest.fn(),
  attachConversationResource: jest.fn(),
  detachConversationResource: jest.fn(),
  fetchAttachableResources: jest.fn(),
}));

import {
  attachConversationResource,
  detachConversationResource,
  fetchConversationAttachments,
} from "../attachments.service";

const mockFetch = fetchConversationAttachments as jest.MockedFunction<
  typeof fetchConversationAttachments
>;
const mockAttach = attachConversationResource as jest.MockedFunction<
  typeof attachConversationResource
>;
const mockDetach = detachConversationResource as jest.MockedFunction<
  typeof detachConversationResource
>;

const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";

function makeStore() {
  return configureStore({
    reducer: { conversationAttachments: attachmentsReducer },
  });
}

function pick(ref: string, name: string): PendingAttachment {
  return {
    provider: "github",
    resource_type: "github_repository",
    display_name: name,
    link: `https://github.com/${ref}`,
    resource_ref: ref,
    metadata: null,
  };
}

function row(ref: string, name: string, id: string): ConversationAttachment {
  return { ...pick(ref, name), association_id: id };
}

function entryOf(store: ReturnType<typeof makeStore>) {
  return selectConversationAttachmentsEntry(CONVERSATION_ID)(
    store.getState() as never,
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockAttach.mockReset();
  mockDetach.mockReset();
});

describe("attachments on an existing conversation", () => {
  it("attaches, lists, and removes", async () => {
    const store = makeStore();
    mockFetch.mockResolvedValue([]);
    await store.dispatch(
      loadConversationAttachments({ conversationId: CONVERSATION_ID }),
    );

    mockAttach.mockResolvedValueOnce(
      row("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx", "assoc-1"),
    );
    await store.dispatch(
      attachResource({
        conversationId: CONVERSATION_ID,
        pick: pick("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx"),
        conversationExists: true,
      }),
    );
    expect(entryOf(store).rows.map((r) => r.resource_ref)).toEqual([
      "armanisadeghi/ai-matrx",
    ]);

    mockDetach.mockResolvedValueOnce(undefined);
    await store.dispatch(
      detachResource({
        conversationId: CONVERSATION_ID,
        associationId: "assoc-1",
      }),
    );
    expect(entryOf(store).rows).toHaveLength(0);
  });

  it("a read that FAILED is never rendered as 'nothing attached'", async () => {
    const store = makeStore();
    mockFetch.mockRejectedValueOnce(new Error("MCP service unreachable"));
    await store.dispatch(
      loadConversationAttachments({ conversationId: CONVERSATION_ID }),
    );
    const entry = entryOf(store);
    expect(entry.status).toBe("failed");
    expect(entry.error).toMatch(/unreachable/i);
  });
});

describe("the /chat/new handoff — picks made before the conversation existed", () => {
  it("holds a pick while there is no row, then carries it over once there is", async () => {
    const store = makeStore();

    // On /chat/new nothing has been read yet, so the row is not known to
    // exist. The pick must be HELD, not thrown at a conversation that is not
    // there — and never silently dropped.
    await store.dispatch(
      attachResource({
        conversationId: CONVERSATION_ID,
        pick: pick("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx"),
        conversationExists: false,
      }),
    );
    await store.dispatch(
      attachResource({
        conversationId: CONVERSATION_ID,
        pick: pick("AI-Matrix-Engine/aidream", "AI-Matrix-Engine/aidream"),
        conversationExists: false,
      }),
    );
    expect(mockAttach).not.toHaveBeenCalled();

    let entry = entryOf(store);
    expect(entry.pending).toHaveLength(2);
    // The person SEES both picks — held is not hidden.
    expect(mergeAttachments(entry.rows, entry.pending)).toHaveLength(2);
    expect(
      mergeAttachments(entry.rows, entry.pending).every((item) => item.pending),
    ).toBe(true);

    // First send happens; the row now exists and the read proves it.
    mockFetch.mockResolvedValueOnce([]);
    await store.dispatch(
      loadConversationAttachments({ conversationId: CONVERSATION_ID }),
    );

    mockAttach
      .mockResolvedValueOnce(
        row("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx", "assoc-1"),
      )
      .mockResolvedValueOnce(
        row("AI-Matrix-Engine/aidream", "AI-Matrix-Engine/aidream", "assoc-2"),
      );
    await store.dispatch(
      flushPendingAttachments({ conversationId: CONVERSATION_ID }),
    );

    entry = entryOf(store);
    expect(mockAttach).toHaveBeenCalledTimes(2);
    expect(entry.pending).toHaveLength(0);
    expect(entry.rows.map((r) => r.association_id).sort()).toEqual([
      "assoc-1",
      "assoc-2",
    ]);
  });

  it("a pick that could not be carried over stays held and says why — it never just vanishes", async () => {
    const store = makeStore();
    await store.dispatch(
      attachResource({
        conversationId: CONVERSATION_ID,
        pick: pick("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx"),
        conversationExists: false,
      }),
    );
    await store.dispatch(
      attachResource({
        conversationId: CONVERSATION_ID,
        pick: pick("AI-Matrix-Engine/aidream", "AI-Matrix-Engine/aidream"),
        conversationExists: false,
      }),
    );

    mockAttach
      .mockResolvedValueOnce(
        row("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx", "assoc-1"),
      )
      .mockRejectedValueOnce(new Error("AI Matrx is not installed on AI-Matrix-Engine"));
    await store.dispatch(
      flushPendingAttachments({ conversationId: CONVERSATION_ID }),
    );

    const entry = entryOf(store);
    expect(entry.rows).toHaveLength(1);
    expect(entry.pending.map((p) => p.resource_ref)).toEqual([
      "AI-Matrix-Engine/aidream",
    ]);
    expect(entry.writeError).toMatch(/not installed on AI-Matrix-Engine/);
  });
});

describe("reload", () => {
  it("restores from the server, not from anything the browser was holding", async () => {
    // A brand-new store is exactly what a reload produces.
    const store = makeStore();
    expect(entryOf(store).rows).toHaveLength(0);

    mockFetch.mockResolvedValueOnce([
      row("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx", "assoc-1"),
      row("AI-Matrix-Engine/aidream", "AI-Matrix-Engine/aidream", "assoc-2"),
      row("armanisadeghi/common-docs", "armanisadeghi/common-docs", "assoc-3"),
    ]);
    await store.dispatch(
      loadConversationAttachments({ conversationId: CONVERSATION_ID }),
    );

    const entry = entryOf(store);
    expect(entry.status).toBe("succeeded");
    expect(entry.rows.map((r) => r.display_name)).toEqual([
      "armanisadeghi/ai-matrx",
      "AI-Matrix-Engine/aidream",
      "armanisadeghi/common-docs",
    ]);
  });

  it("a pick that landed while we were not looking stops being pending", async () => {
    const store = makeStore();
    await store.dispatch(
      attachResource({
        conversationId: CONVERSATION_ID,
        pick: pick("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx"),
        conversationExists: false,
      }),
    );
    mockFetch.mockResolvedValueOnce([
      row("armanisadeghi/ai-matrx", "armanisadeghi/ai-matrx", "assoc-1"),
    ]);
    await store.dispatch(
      loadConversationAttachments({ conversationId: CONVERSATION_ID }),
    );
    const entry = entryOf(store);
    expect(entry.pending).toHaveLength(0);
    expect(mergeAttachments(entry.rows, entry.pending)).toHaveLength(1);
  });
});
