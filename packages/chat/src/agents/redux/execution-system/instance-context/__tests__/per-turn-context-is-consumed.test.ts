/**
 * A quoted passage rides with ONE message. RC-B6 verify: the "Quoted" chip
 * stayed after send and re-attached itself to every later turn. The send path
 * (executeInstance, after the context snapshot) consumes per-turn keys; other
 * context stays.
 */
import reducer, {
  PER_TURN_CONTEXT_KEYS,
  consumePerTurnContext,
  setContextEntries,
} from "../instance-context.slice";
import { QUOTED_PASSAGES_CONTEXT_KEY } from "@/features/rich-document/actions/handlers/ask";
import * as fs from "fs";
import * as path from "path";

jest.mock("@/features/rich-document/actions/provider", () => ({ registerAction: () => {} }));

describe("per-turn context", () => {
  it("the quote key is a per-turn key", () => {
    expect(PER_TURN_CONTEXT_KEYS).toContain(QUOTED_PASSAGES_CONTEXT_KEY);
  });

  it("consuming drops the quote and keeps standing context", () => {
    let state = reducer(undefined, { type: "@@INIT" });
    state = reducer(
      state,
      setContextEntries({
        conversationId: "c1",
        entries: [
          { key: QUOTED_PASSAGES_CONTEXT_KEY, value: [{ text: "a passage" }] },
          { key: "working_document", value: "doc body" },
        ],
      }),
    );
    state = reducer(state, consumePerTurnContext("c1"));
    expect(Object.keys(state.byConversationId.c1)).toEqual(["working_document"]);
  });

  it("the send path consumes per-turn context after the snapshot, never on retry", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../thunks/execute-instance.thunk.ts"),
      "utf8",
    );
    const snap = src.indexOf("selectInstanceContextEntries(conversationId)(stateAtSubmit)");
    const consume = src.indexOf("if (!retry) dispatch(consumePerTurnContext(conversationId))");
    expect(snap).toBeGreaterThan(0);
    expect(consume).toBeGreaterThan(snap);
  });
});
