/**
 * A DIRECTIVE CARD SURVIVES A RELOAD — the host half (reviewer defect 5, 2026-10-02).
 *
 * The package (`@ai-matrx/content-ir-react` 0.14.0) reads `applyState` on mount
 * and renders an applied block as its tally. This pins the HOST seam: it asks
 * the server's ledger (never computes the key), in the SAME namespace `confirm`
 * applies in — no conversation, the person's — batches every card on a page into
 * ONE request, never raises the organization picker for a background read, and
 * maps the server's per-item answer onto the card's three states.
 */

const fetchDirectiveApplyState = jest.fn();
const confirmDirective = jest.fn();

jest.mock("@/features/directive-catalog/service", () => ({
  confirmDirective: (...args: unknown[]) => confirmDirective(...args),
  fetchDirectiveApplyState: (...args: unknown[]) => fetchDirectiveApplyState(...args),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}), dispatch: jest.fn() }),
}));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://server.example.test",
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => jest.fn(),
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";

const TASK_A = "4127fbc8-0000-4000-8000-00000000000a";
const TASK_B = "4127fbc8-0000-4000-8000-00000000000b";

function shellState(
  directive: string,
  items: Array<{ state: string; message?: string | null; resource_ids?: string[] }>,
  extra: Record<string, unknown> = {},
) {
  return {
    directive,
    proposal_id: "p",
    directive_class: directive.split("_")[2],
    noun: "task",
    item_count: items.length,
    message: "",
    items: items.map((item, index) => ({
      index,
      message: null,
      resource_ids: [],
      ...item,
    })),
    approvable: items.some((item) => item.state === "not_applied"),
    unreadable: null,
    ...extra,
  };
}

const RAN_TWICE = { copies: 2 };

describe("the host reads the ledger so a card survives a reload", () => {
  beforeEach(() => {
    fetchDirectiveApplyState.mockReset();
    confirmDirective.mockReset();
  });

  it("batches every card on the page into ONE read, in the person's namespace, without the picker", async () => {
    fetchDirectiveApplyState.mockResolvedValue({
      conversation_id: null,
      shells: [
        shellState("directive_v1_delete_task", [
          { state: "applied", message: "Deleted task.", resource_ids: [TASK_A] },
        ]),
        shellState("directive_v1_create_task", [{ state: "not_applied" }]),
      ],
    });

    const read = matrxDirectiveHost.applyState!;
    const [deleted, created] = await Promise.all([
      read({ __kind: "directive_v1_delete_task", items: [{ id: TASK_A }] }),
      read({ __kind: "directive_v1_create_task", items: [{ title: "New" }] }),
    ]);

    expect(fetchDirectiveApplyState).toHaveBeenCalledTimes(1);
    const [baseUrl, body, options] = fetchDirectiveApplyState.mock.calls[0];
    expect(baseUrl).toBe("https://server.example.test");
    // No conversation: the SAME namespace `confirm` applies a note's block in.
    expect(body).toEqual({
      shells: [
        { __kind: "directive_v1_delete_task", items: [{ id: TASK_A }] },
        { __kind: "directive_v1_create_task", items: [{ title: "New" }] },
      ],
    });
    expect(options).toEqual({ interactive: false });

    expect(deleted).toEqual({
      state: "applied",
      message: "Deleted task.",
      records: [{ noun: "task", id: TASK_A }],
      // An older server sends no `copies`: the block applied once.
      copies: 1,
    });
    expect(created).toEqual({ state: "not_applied" });
  });

  it("a card in a chat message is read in ITS conversation — one read per namespace", async () => {
    fetchDirectiveApplyState.mockImplementation(async (_base: string, body: { shells: unknown[] }) => ({
      conversation_id: null,
      shells: body.shells.map(() => shellState("directive_v1_create_task", [{ state: "not_applied" }])),
    }));
    const read = matrxDirectiveHost.applyState!;
    await Promise.all([
      read({ __kind: "directive_v1_create_task", items: [{ title: "a" }], conversationId: "conv-1" }),
      read({ __kind: "directive_v1_create_task", items: [{ title: "b" }] }),
      read({ __kind: "directive_v1_create_task", items: [{ title: "c" }], conversationId: "conv-1" }),
    ]);
    expect(fetchDirectiveApplyState).toHaveBeenCalledTimes(2);
    const bodies = fetchDirectiveApplyState.mock.calls.map((call) => call[1]);
    expect(bodies).toContainEqual({
      shells: [
        { __kind: "directive_v1_create_task", items: [{ title: "a" }] },
        { __kind: "directive_v1_create_task", items: [{ title: "c" }] },
      ],
      conversation_id: "conv-1",
    });
    expect(bodies).toContainEqual({
      shells: [{ __kind: "directive_v1_create_task", items: [{ title: "b" }] }],
    });
  });

  it("confirm sends the card's conversation and Run again's force — and nothing when absent", async () => {
    confirmDirective.mockResolvedValue({
      directive: "directive_v1_create_task",
      proposal_id: "p",
      applied: 1,
      failed: 0,
      message: "Created task.",
      receipts: [],
    });
    await matrxDirectiveHost.confirm!({
      __kind: "directive_v1_create_task",
      items: [{ title: "a" }],
      conversationId: "conv-1",
      force: true,
    });
    await matrxDirectiveHost.confirm!({ __kind: "directive_v1_create_task", items: [{ title: "a" }] });
    expect(confirmDirective.mock.calls[0][1]).toEqual({
      directive: "directive_v1_create_task",
      items: [{ title: "a" }],
      conversation_id: "conv-1",
      force: true,
    });
    expect(confirmDirective.mock.calls[1][1]).toEqual({
      directive: "directive_v1_create_task",
      items: [{ title: "a" }],
    });
  });

  it("any item mid-apply → in_flight; a partly-applied batch is still approvable → not_applied", async () => {
    fetchDirectiveApplyState.mockResolvedValue({
      conversation_id: null,
      shells: [
        shellState("directive_v1_update_task", [{ state: "applied", resource_ids: [TASK_A] }, { state: "in_flight" }]),
        shellState("directive_v1_update_task", [{ state: "applied", resource_ids: [TASK_A] }, { state: "not_applied" }]),
      ],
    });
    const read = matrxDirectiveHost.applyState!;
    const [flying, partial] = await Promise.all([
      read({ __kind: "directive_v1_update_task", items: [{ id: TASK_A }, { id: TASK_B }] }),
      read({ __kind: "directive_v1_update_task", items: [{ id: TASK_A, title: "x" }, { id: TASK_B }] }),
    ]);
    expect(flying).toEqual({ state: "in_flight" });
    expect(partial).toEqual({ state: "not_applied" });
  });

  it("a multi-item applied batch carries every record and no single item's sentence", async () => {
    fetchDirectiveApplyState.mockResolvedValue({
      conversation_id: null,
      shells: [
        shellState("directive_v1_create_task", [
          // `copies` is newer than the generated contract (aidream cc87e4e53c),
          // so it rides a spread exactly as the wire would carry it.
          { state: "applied", message: "Created task.", resource_ids: [TASK_A], ...RAN_TWICE },
          { state: "applied", message: "Created task.", resource_ids: [TASK_B], ...RAN_TWICE },
        ]),
      ],
    });
    const answer = await matrxDirectiveHost.applyState!({
      __kind: "directive_v1_create_task",
      items: [{ title: "a" }, { title: "b" }],
    });
    expect(answer).toEqual({
      state: "applied",
      message: null,
      records: [
        { noun: "task", id: TASK_A },
        { noun: "task", id: TASK_B },
      ],
      // The server's per-item count after a Run again (aidream applied_summary).
      copies: 2,
    });
  });

  it("an unreadable shell and a failed read REJECT (the card reports it and offers Apply)", async () => {
    fetchDirectiveApplyState.mockResolvedValueOnce({
      conversation_id: null,
      shells: [shellState("directive_v1_delete_task", [], { unreadable: "the stored items do not match" })],
    });
    await expect(
      matrxDirectiveHost.applyState!({ __kind: "directive_v1_delete_task", items: [{ id: "nope" }] }),
    ).rejects.toThrow("the stored items do not match");

    fetchDirectiveApplyState.mockRejectedValueOnce(new Error("network down"));
    await expect(
      matrxDirectiveHost.applyState!({ __kind: "directive_v1_delete_task", items: [{ id: TASK_A }] }),
    ).rejects.toThrow("network down");
  });
});
