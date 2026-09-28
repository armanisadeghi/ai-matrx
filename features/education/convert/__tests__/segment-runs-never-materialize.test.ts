/**
 * Every converter run's conversation (segmented background or single live) is claimed by the
 * surface before its stream commits, so the commit step never materializes a
 * per-section twin (live 2026-09-28: a 6-section deck landed as 7 decks).
 */
import { runAgentExtraction } from "../runAgentExtraction";
import { isConversationSurfaceOwned } from "@/features/canvas/materialization/surfaceOwnedConversations";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import type { AppDispatch, AppStore } from "@/lib/redux/store";

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

describe("segment runs never materialize", () => {
  it("claims a background run's conversation before its stream commits", async () => {
    fakeRun("conv-background");
    await run(false);
    expect(isConversationSurfaceOwned("conv-background")).toBe(true);
  });

  it("claims a live single-pass run's conversation too (the surface saves it)", async () => {
    fakeRun("conv-live");
    await run(true);
    expect(isConversationSurfaceOwned("conv-live")).toBe(true);
  });

  it("an unclaimed conversation is not surface-owned", () => {
    expect(isConversationSurfaceOwned("conv-never-claimed")).toBe(false);
  });
});
