/**
 * A second Submit All with an empty shared composer (Model Battle, 2026-10-01).
 *
 * The bug a person hit: the shared request ran from the agent's variables, the
 * person pressed Submit All again with nothing typed, and every column that had
 * already run sent an empty follow-up — the send door refused each one
 * ("refused an empty turn") and the toast said "2 failed".
 *
 * Ruling (2026-10-01): a column that already ran is held when there is no typed
 * text — it never fires, so it never fails — and the shared composer says
 * "Type a follow-up to run again". A column that has NOT run still starts from
 * the variables in the same click.
 *
 * SUT: the real `submitAllModel` thunk and the real empty-turn rule. Doubles:
 * the two execution primitives it dispatches (copy + smartExecute) are recorded,
 * not run; battle persistence resolves.
 */

const fired: string[] = [];

jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({
    smartExecute: (args: { conversationId: string }) => ({
      type: "test/smartExecute",
      conversationId: args.conversationId,
    }),
  }),
);
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk",
  () => ({
    copyInstanceRequestDraft: (args: { targetConversationId: string }) => ({
      type: "test/copy",
      conversationId: args.targetConversationId,
    }),
  }),
);

import { submitAllModel } from "./thunks";
import { FOLLOW_UP_NEEDED_TEXT } from "@/features/agent-comparison/shared/battle-follow-up";
import { selectModelFollowUpNotice } from "./selectors";
import type { RootState } from "@/lib/redux/store";

function battleState(opts: { sharedText: string; ranColumns: string[] }) {
  const columns = ["col-gpt", "col-claude"];
  const input = (text: string) => ({ text, messageParts: null, submissionPhase: "idle", lastSubmittedText: "" });
  return {
    agentComparisonModel: {
      locked: { agentId: "agent-support-reply", agentVersion: null, agentVersionId: null },
      inputConversationId: "shared",
      columns: columns.map((id) => ({ columnId: id, conversationId: id, label: id, collapsed: false })),
      activeSetId: null,
      activeSetName: null,
      isSubmittingAll: false,
      followUpNeeded: false,
    },
    conversations: {
      byConversationId: Object.fromEntries(
        columns.map((id) => [id, { cacheOnly: !opts.ranColumns.includes(id), isEphemeral: false }]),
      ),
    },
    messages: {
      byConversationId: Object.fromEntries(
        columns.map((id) => [id, { orderedIds: opts.ranColumns.includes(id) ? ["u1", "a1"] : [] }]),
      ),
    },
    instanceUserInput: { byConversationId: { shared: input(opts.sharedText) } },
    instanceVariableValues: {
      byConversationId: { shared: { userValues: { tone: "warm" }, scopeValues: {} } },
    },
    instanceResources: { byConversationId: {} },
  } as unknown as RootState;
}

async function submitAll(state: RootState) {
  let current = state;
  const dispatch = (action: unknown): unknown => {
    if (typeof action === "function") {
      // persistModelBattle and friends — resolve, never run.
      return { unwrap: () => Promise.resolve({}) };
    }
    const a = action as { type: string; conversationId?: string; payload?: unknown };
    if (a.type === "test/smartExecute" && a.conversationId) fired.push(a.conversationId);
    if (a.type === "agentComparisonModel/setModelFollowUpNeeded") {
      current = {
        ...current,
        agentComparisonModel: { ...current.agentComparisonModel, followUpNeeded: a.payload as boolean },
      } as RootState;
    }
    return { ...a, unwrap: () => Promise.resolve(undefined) };
  };
  const action = await submitAllModel()(dispatch as never, () => current, undefined);
  return { result: action.payload as { launched: number; failed: number; needsFollowUp?: number }, state: () => current };
}

beforeEach(() => {
  fired.length = 0;
});

describe("Submit All with an empty shared composer", () => {
  it("holds every column that already ran — none fires, none fails — and the composer says why", async () => {
    const { result, state } = await submitAll(battleState({ sharedText: "", ranColumns: ["col-gpt", "col-claude"] }));
    expect(fired).toEqual([]);
    expect(result).toMatchObject({ launched: 0, failed: 0, needsFollowUp: 2 });
    expect(selectModelFollowUpNotice(state())).toBe(FOLLOW_UP_NEEDED_TEXT);
  });

  it("still starts a column that has not run from the variables, in the same click", async () => {
    const { result } = await submitAll(battleState({ sharedText: "", ranColumns: ["col-gpt"] }));
    expect(fired).toEqual(["col-claude"]);
    expect(result).toMatchObject({ launched: 1, needsFollowUp: 1 });
  });

  it("sends a typed follow-up to every column, and shows no line", async () => {
    const { result, state } = await submitAll(
      battleState({ sharedText: "Make it shorter.", ranColumns: ["col-gpt", "col-claude"] }),
    );
    expect(fired).toEqual(["col-gpt", "col-claude"]);
    expect(result).toMatchObject({ launched: 2, failed: 0 });
    expect(selectModelFollowUpNotice(state())).toBeNull();
  });
});
