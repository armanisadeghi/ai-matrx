/**
 * `request_user_takeover` handler — agent stops; user does something the
 * agent can't. In the Next.js surface this means "answer in the chat input
 * with what you did / want, then submit." The chat input is NEVER disabled
 * (per the inline-ask UX contract); the takeover card just makes the
 * request visible above the input. Awaits a text response.
 */

import type { ToolHandler } from "./types";
import type { RequestTakeoverArgs } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE, type AskUserResponse } from "../tools/schemas";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
} from "../redux/pending-asks.slice";
import {
  registerAskResolver,
  expireAskByCallId,
} from "../redux/ask-resolver-registry";

export const requestTakeoverHandler: ToolHandler<
  RequestTakeoverArgs,
  AskUserResponse
> = {
  name: "request_user_takeover",
  async run(args, ctx) {
    const { callId, conversationId, dispatch } = ctx;

    const question = args.expected_action
      ? `${args.reason}\n\nExpected: ${args.expected_action}`
      : args.reason;

    // No model-controlled timeout (the DB contract carries no timeout_seconds);
    // the takeover stays open until the user responds.
    const expiresAtMs: number | undefined = undefined;

    dispatch(
      enqueuePendingAsk({
        callId,
        conversationId,
        toolName: "request_user_takeover",
        kind: "takeover",
        question,
        context: args.instructions,
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
            setTimeout(() => expireAskByCallId(callId), ms);
          } else {
            resolve({ ...EMPTY_ASK_RESPONSE, timed_out: true });
          }
        }
      },
    );

    dispatch(resolvePendingAsk({ callId, conversationId }));
    queueMicrotask(() => {
      setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
    });

    return response;
  },
};
