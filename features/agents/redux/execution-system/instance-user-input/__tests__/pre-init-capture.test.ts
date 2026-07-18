/**
 * Pre-init keystroke capture — the entry-creation race (D60 class).
 *
 * The composer is typeable as soon as the client conversation UUID exists,
 * but the input entry lands only when `createInstanceFull` resolves its async
 * agent fetch. `setUserInputText` must NEVER drop those keystrokes, and
 * instance init must preserve the captured draft rather than clobber it with
 * an empty entry.
 */

import reducer, {
  initInstanceUserInput,
  setUserInputText,
} from "../instance-user-input.slice";
import { createInstanceFull } from "../../create-instance-full";

const CID = "11111111-1111-4111-8111-111111111111";

// The capture path screams by design (loud recovery); keep test output clean.
beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("pre-init keystroke capture", () => {
  it("creates the entry and keeps the text when no entry exists yet", () => {
    const state = reducer(
      undefined,
      setUserInputText({ conversationId: CID, text: "hel" }),
    );
    expect(state.byConversationId[CID]?.text).toBe("hel");
    expect(state.byConversationId[CID]?.submissionPhase).toBe("idle");
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("createInstanceFull preserves a pre-init draft (no userInput.text)", () => {
    let state = reducer(
      undefined,
      setUserInputText({ conversationId: CID, text: "hello wor" }),
    );
    state = reducer(
      state,
      createInstanceFull({
        conversationId: CID,
        agentId: "a",
        agentType: "user",
        origin: "manual",
      }),
    );
    expect(state.byConversationId[CID]?.text).toBe("hello wor");
  });

  it("createInstanceFull with explicit userInput.text still wins", () => {
    let state = reducer(
      undefined,
      setUserInputText({ conversationId: CID, text: "typed" }),
    );
    state = reducer(
      state,
      createInstanceFull({
        conversationId: CID,
        agentId: "a",
        agentType: "user",
        origin: "manual",
        userInput: { text: "explicit" },
      }),
    );
    expect(state.byConversationId[CID]?.text).toBe("explicit");
  });

  it("initInstanceUserInput preserves a pre-init draft when no text given", () => {
    let state = reducer(
      undefined,
      setUserInputText({ conversationId: CID, text: "draft in flight" }),
    );
    state = reducer(state, initInstanceUserInput({ conversationId: CID }));
    expect(state.byConversationId[CID]?.text).toBe("draft in flight");
  });

  it("initInstanceUserInput with explicit text still wins", () => {
    let state = reducer(
      undefined,
      setUserInputText({ conversationId: CID, text: "typed" }),
    );
    state = reducer(
      state,
      initInstanceUserInput({ conversationId: CID, text: "carried" }),
    );
    expect(state.byConversationId[CID]?.text).toBe("carried");
  });

  it("normal post-init typing does not warn", () => {
    let state = reducer(undefined, initInstanceUserInput({ conversationId: CID }));
    state = reducer(
      state,
      setUserInputText({ conversationId: CID, text: "hi" }),
    );
    expect(state.byConversationId[CID]?.text).toBe("hi");
    expect(console.warn).not.toHaveBeenCalled();
  });
});
