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
  const answers: AskUserResponse[] = [];
  let cancelled = false;
  let timed_out = false;
  let wrote_instead = false;
  let additional_instructions: string | null = null;

  for (let i = 0; i < questions.length; i++) {
    const env = await runSingle(questions[i]!, ctx, {
      index: i,
      total: questions.length,
    });
    answers.push(env);
    // Bubble the user's freeform note up to the batch result (it only renders
    // on the final card, so this captures the last non-empty one).
    if (env.additional_instructions) {
      additional_instructions = env.additional_instructions;
    }
    // "Write message instead", cancel, or timeout each short-circuit the rest —
    // the remaining questions come back as empty envelopes with the matching
    // flag set so the model sees which one ended the batch.
    if (env.wrote_instead) {
      wrote_instead = true;
      for (let j = i + 1; j < questions.length; j++) {
        answers.push({ ...EMPTY_ASK_RESPONSE, wrote_instead: true });
      }
      break;
    }
    if (env.cancelled) {
      cancelled = true;
      for (let j = i + 1; j < questions.length; j++) {
        answers.push({ ...EMPTY_ASK_RESPONSE, cancelled: true });
      }
      break;
    }
    if (env.timed_out) {
      timed_out = true;
      for (let j = i + 1; j < questions.length; j++) {
        answers.push({ ...EMPTY_ASK_RESPONSE, timed_out: true });
      }
      break;
    }
  }

  return { answers, cancelled, timed_out, wrote_instead, additional_instructions };
}
