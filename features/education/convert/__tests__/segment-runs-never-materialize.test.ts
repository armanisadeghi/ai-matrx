/**
 * Every converter run's conversation (segmented background or single live) is
 * SURFACE-OWNED: the flag is a launch option carried on the conversation record
 * in the execution-system Redux state (stamped before the stream commits, saved
 * with the row, restored on load), so no materializer mints a per-section twin
 * (live 2026-09-28: a 6-section deck landed as 7 decks) — not in this tab, and
 * not after a reload or resume (the old module-level Set was lost on reload).
 */
import { configureStore } from "@reduxjs/toolkit";
import { runAgentExtraction } from "../runAgentExtraction";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import conversationsReducer, {
  createInstance,
  hydrateConversation,
  setInstanceSurfaceOwnsOutput,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { selectConversationSurfaceOwnsOutput } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { parsePersistedSurfaceOwnsOutput } from "@/features/agents/redux/execution-system/conversations/surface-owns-output.persistence";
import type { AppDispatch, AppStore, RootState } from "@/lib/redux/store";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  runHeadlessAgentJson: jest.fn(),
}));

const mocked = jest.mocked(runHeadlessAgentJson);

function fakeRun(conversationId: string) {
  mocked.mockImplementation(async (_d, _g, opts) => {
    opts.onConversationCreated?.(conversationId);
    return {
      success: true,
      data: { cards: [] },
      requestId: "req-1",
      conversationId,
    } as never;
  });
}

const run = (live: boolean) =>
  runAgentExtraction({} as AppDispatch, { getState: () => ({}) } as unknown as AppStore, {
    mandateKey: "flashcards__generate_from_source" as never,
    surfaceKey: "test",
    sourceFeature: "education-flashcards" as never,
    organizationId: null,
    variables: {},
    live,
  });

/** A real conversations slice — the state the materializer reads. */
function freshStore() {
  const store = configureStore({ reducer: { conversations: conversationsReducer } });
  const owns = (id: string) =>
    selectConversationSurfaceOwnsOutput(store.getState() as unknown as RootState, id);
  return { store, owns };
}

describe("segment runs never materialize", () => {
  it("launches a background run as surface-owned (a launch option, not a side table)", async () => {
    fakeRun("conv-background");
    await run(false);
    expect(mocked.mock.calls.at(-1)?.[2].surfaceOwnsOutput).toBe(true);
  });

  it("launches a live single-pass run as surface-owned too (the surface saves it)", async () => {
    fakeRun("conv-live");
    await run(true);
    expect(mocked.mock.calls.at(-1)?.[2].surfaceOwnsOutput).toBe(true);
  });

  it("declares a background section run 'auto' so it stays out of the chat sidebar", async () => {
    fakeRun("conv-auto");
    await run(false);
    expect(mocked.mock.calls.at(-1)?.[2].initiation).toBe("auto");
    fakeRun("conv-person");
    await run(true);
    expect(mocked.mock.calls.at(-1)?.[2].initiation).toBeUndefined();
  });

  it("the launch stamp lands on the conversation record the materializer reads", () => {
    const { store, owns } = freshStore();
    store.dispatch(
      createInstance({
        conversationId: "conv-owned",
        agentId: "agent-1",
        agentType: "user",
        origin: "manual",
      }),
    );
    store.dispatch(
      createInstance({
        conversationId: "conv-chat",
        agentId: "agent-1",
        agentType: "user",
        origin: "manual",
      }),
    );
    store.dispatch(
      setInstanceSurfaceOwnsOutput({ conversationId: "conv-owned", surfaceOwnsOutput: true }),
    );
    expect(owns("conv-owned")).toBe(true);
    expect(owns("conv-chat")).toBe(false);
    expect(owns("conv-never-launched")).toBe(false);
  });

  it("a reload restores the flag from the saved row, so a resumed run still never materializes", () => {
    // A brand-new store is a reload: nothing survives but the row.
    const { store, owns } = freshStore();
    const savedMetadata = { surface_owns_output: true, display: {} };
    store.dispatch(
      hydrateConversation({
        conversationId: "conv-resumed",
        agentId: "agent-1",
        ...(parsePersistedSurfaceOwnsOutput(savedMetadata) ? { surfaceOwnsOutput: true } : {}),
      }),
    );
    expect(owns("conv-resumed")).toBe(true);
    expect(parsePersistedSurfaceOwnsOutput({ display: {} })).toBe(false);
    expect(parsePersistedSurfaceOwnsOutput(null)).toBe(false);
  });
});
