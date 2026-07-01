/**
 * `user` handler — the ask-user mega-tool.
 *
 * Two forms:
 *   - Single-question: top-level `type` + question/options/etc. Resolves
 *     to a single `AskUserResponse` envelope.
 *   - Batched: `questions: [SingleQuestion, ...]` (1–4). Renders one card
 *     per question in sequence, returns `BatchedAskUserResponse`. Cancel
 *     or timeout on any card short-circuits the rest (remaining entries
 *     come back as empty envelopes with `cancelled`/`timed_out` set so
 *     the model sees which one ended the batch).
 *
 * Flow per question:
 *   1. Normalize options (string → {label}).
 *   2. Build a PendingAsk descriptor + register a resolver in the
 *      module registry (keyed by callId; batched questions use
 *      `${parentCallId}.${index}` to avoid collisions).
 *   3. Dispatch `enqueuePendingAsk` so the inline AskCard renders.
 *   4. Optionally schedule a timeout that resolves with `{timed_out: true}`.
 *   5. Await the resolver's promise. The user's click in <AskCard /> calls
 *      `resolveAskByCallId(...)`, fulfilling the promise.
 *   6. Sweep the card after a short delay so the UI shows a resolved state
 *      momentarily before fading.
 */

import type { ToolHandler, HandlerContext } from "./types";
import type {
  UserArgs,
  UserSingleQuestion,
  AskUserResponse,
  BatchedAskUserResponse,
} from "../tools/schemas";
import {
  EMPTY_ASK_RESPONSE,
  isBatchedUserArgs,
  normalizeAskOptions,
} from "../tools/schemas";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
  type PendingAskKind,
  type PendingAskLevel,
} from "../redux/pending-asks.slice";
import {
  registerAskResolver,
  expireAskByCallId,
} from "../redux/ask-resolver-registry";

function kindFromUserType(t: UserSingleQuestion["type"]): PendingAskKind {
  return t as PendingAskKind;
}

function levelOrInfo(level?: string): PendingAskLevel {
  if (
    level === "info" ||
    level === "success" ||
    level === "warning" ||
    level === "error"
  ) {
    return level;
  }
  return "info";
}

export const userHandler: ToolHandler<
  UserArgs,
  AskUserResponse | BatchedAskUserResponse
> = {
  name: "user",
  async run(args, ctx) {
    if (isBatchedUserArgs(args)) {
      return runBatched(args.questions, ctx);
    }
    // superRefine guarantees `type` is set when not batched.
    return runSingle(args as UserSingleQuestion, ctx);
  },
};

async function runSingle(
  q: UserSingleQuestion,
  ctx: HandlerContext,
  batch?: { index: number; total: number },
): Promise<AskUserResponse> {
  const { conversationId, dispatch } = ctx;
  // Batched questions need distinct callIds so the inbox treats them as
  // separate cards (otherwise the second one collides with the first
  // when we await the response).
  const callId = batch ? `${ctx.callId}.${batch.index}` : ctx.callId;

  const expiresAtMs =
    typeof q.timeout_seconds === "number"
      ? Date.now() + q.timeout_seconds * 1000
      : undefined;

  dispatch(
    enqueuePendingAsk({
      callId,
      conversationId,
      toolName: "user",
      kind: kindFromUserType(q.type),
      question: q.question,
      header: q.header,
      context: q.context,
      // Batched questions share the parent callId so the zone renders one wizard.
      batchId: batch ? ctx.callId : undefined,
      options: normalizeAskOptions(q.options),
      // Always offer a freeform "Other" escape on choice/choice_many — independent of
      // what the model sent (allow_other isn't even in the canonical model schema).
      allowOther:
        q.type === "choice" || q.type === "choice_many"
          ? true
          : q.allow_other,
      message: q.message,
      actions: q.actions,
      level: levelOrInfo(q.level),
      batchIndex: batch?.index,
      batchTotal: batch?.total,
      expiresAtMs,
      status: "pending",
      createdAtMs: Date.now(),
    }),
  );

  const response: AskUserResponse = await new Promise<AskUserResponse>(
    (resolve) => {
      registerAskResolver(callId, resolve);

      if (expiresAtMs) {
        const ms = expiresAtMs - Date.now();
        if (ms > 0) {
          setTimeout(() => {
            // expireAskByCallId is a no-op if the user already answered.
            expireAskByCallId(callId);
          }, ms);
        } else {
          // Already expired — resolve immediately.
          resolve({ ...EMPTY_ASK_RESPONSE, timed_out: true });
        }
      }
    },
  );

  // Update slice state for fade-out; sweep on a microtask so the UI gets
  // one paint with the resolved status before the card disappears.
  dispatch(resolvePendingAsk({ callId, conversationId }));
  queueMicrotask(() => {
    setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
  });

  return response;
}

async function runBatched(
  questions: UserSingleQuestion[],
  ctx: HandlerContext,
): Promise<BatchedAskUserResponse> {
  // Enqueue every question UP FRONT (not sequentially) so the UI can present
  // them as one wizard with free back/forth navigation — the user is never
  // trapped answering in strict order. `runSingle` enqueues its card + registers
  // its resolver synchronously, then awaits; mapping over them fires all the
  // enqueues before any await, so all cards exist at once. `<BatchAskCard>`
  // collects drafts and resolves the whole batch together (skip / write-instead
  // resolve every question with the matching flag). The agent still only sees a
  // result once the batch completes — identical to the old sequential model.
  const answers = await Promise.all(
    questions.map((q, index) =>
      runSingle(q, ctx, { index, total: questions.length }),
    ),
  );

  const cancelled = answers.some((a) => a.cancelled);
  const timed_out = answers.some((a) => a.timed_out);
  const wrote_instead = answers.some((a) => a.wrote_instead);
  // The freeform note rides on the final card; fall back to the last non-empty.
  const additional_instructions =
    [...answers].reverse().find((a) => a.additional_instructions)
      ?.additional_instructions ?? null;

  return { answers, cancelled, timed_out, wrote_instead, additional_instructions };
}
