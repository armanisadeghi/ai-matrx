// packages/chat/src/agents/redux/execution-system/instance-resources/answer-edit-remark.ts
//
// THE edit stager (Turn References ruling 3). Every saved edit to an agent
// answer — typing in the in-place editor, a code/table edit in the body, a
// decision choice, a kind writing back into the text — reaches `saveAnswerEdit`,
// which calls `stageAnswerEditRemark` once the row is written. One chip per
// answer (coalesce key `edit:<messageId>`) while unsent:
//
//   • base   = the answer text as of the last send: the FIRST edit after a send
//              captures the pre-edit stored text; later edits keep that base.
//   • after  = the stored text now. after === base → the chip is removed.
//   • origin = text | choice | kind. A caller's projection ("I chose SQLite.")
//              replaces the raw diff only while every change on that answer
//              came with one; a plain text edit mixed in falls back to the diff,
//              which carries everything (nothing is lost).

import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import {
  remarkSourceOf,
  stageRemark,
  unstageRemark,
  type AnswerEditRemarkMeta,
  type EditRemark,
} from "./remarks";

export function editRemarkKey(messageId: string): string {
  return `edit:${messageId}`;
}

export interface StageAnswerEditArgs {
  conversationId: string;
  messageId: string;
  /** Stored answer text before this save. */
  beforeText: string;
  /** Stored answer text after this save. */
  afterText: string;
  meta?: AnswerEditRemarkMeta | null;
}

/** The live (unsent) edit remark on this answer, if any. */
function liveEditRemark(state: ChatRootState, conversationId: string, key: string): EditRemark | null {
  const resources = state.instanceResources.byConversationId[conversationId] ?? {};
  const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
  for (const r of Object.values(resources)) {
    if (submitted.has(r.resourceId)) continue;
    const source = remarkSourceOf(r);
    if (source?.coalesceKey === key && source.remark.kind === "edit") return source.remark;
  }
  return null;
}

/** Pure merge — exported for the forcing-function tests. */
export function mergeEditRemark(
  live: EditRemark | null,
  args: Omit<StageAnswerEditArgs, "conversationId">,
  composerConversationId: string,
): EditRemark | null {
  const before = live ? live.before : args.beforeText;
  if (before === args.afterText) return null;
  const meta = args.meta ?? null;
  const projection = meta?.projection?.trim() ? meta.projection.trim() : null;
  const quote = meta?.quote?.trim() ? meta.quote.trim() : null;

  let origin: EditRemark["origin"];
  let nextProjection: string | null;
  let nextQuote: string | null;
  if (!live) {
    origin = meta?.origin ?? "text";
    nextProjection = projection;
    nextQuote = projection ? quote : null;
  } else if (live.projection && projection) {
    origin = live.origin === (meta?.origin ?? "text") ? live.origin : "text";
    nextProjection = `${live.projection}\n${projection}`;
    nextQuote = live.quote === quote ? quote : null;
  } else {
    // A change without words (typing) on an answer that already had some, or
    // the reverse: the diff is the only lossless record.
    origin = live.origin === (meta?.origin ?? "text") ? live.origin : "text";
    nextProjection = null;
    nextQuote = null;
  }
  return {
    kind: "edit",
    target: { conversationId: composerConversationId, messageId: args.messageId },
    before,
    after: args.afterText,
    origin,
    projection: nextProjection,
    quote: nextQuote,
  };
}

export function stageAnswerEditRemark(args: StageAnswerEditArgs) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): string | null => {
    const key = editRemarkKey(args.messageId);
    const live = liveEditRemark(getState(), args.conversationId, key);
    const next = mergeEditRemark(live, args, args.conversationId);
    if (!next) {
      dispatch(unstageRemark(args.conversationId, key));
      return null;
    }
    return dispatch(stageRemark(args.conversationId, next, { coalesceKey: key }));
  };
}
