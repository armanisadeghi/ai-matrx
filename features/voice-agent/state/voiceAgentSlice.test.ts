import reducer, {
  appendUserTurn,
  completeUserTurn,
  initInstance,
  updateUserTranscriptDelta,
} from "./voiceAgentSlice";

describe("voiceAgentSlice user transcript", () => {
  test("the completed server transcript replaces malformed deltas", () => {
    let state = reducer(
      undefined,
      initInstance({
        instanceId: "voice-1",
        voiceId: "eve",
        instructions: "Tutor",
        tools: [],
        preset: "playground",
        persist: false,
      }),
    );
    state = reducer(
      state,
      appendUserTurn({
        instanceId: "voice-1",
        turnId: "turn-1",
        startedAtMs: 1,
      }),
    );
    state = reducer(
      state,
      updateUserTranscriptDelta({
        instanceId: "voice-1",
        turnId: "turn-1",
        deltaText: "[undefined] undefined",
      }),
    );
    state = reducer(
      state,
      completeUserTurn({
        instanceId: "voice-1",
        turnId: "turn-1",
        transcript: "Why do mitochondria produce ATP?",
        endedAtMs: 2,
      }),
    );

    expect(state.instances["voice-1"]?.turns[0]).toMatchObject({
      text: "Why do mitochondria produce ATP?",
      text_reveal_index: 32,
      status: "completed",
    });
  });
});
