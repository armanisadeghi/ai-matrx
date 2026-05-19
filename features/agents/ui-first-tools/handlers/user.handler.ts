/**
 * `user` handler — the ask-user mega-tool.
 *
 * Flow:
 *   1. Build a PendingAsk descriptor from the args.
 *   2. Register an ask-resolver in the module registry.
 *   3. Dispatch `enqueuePendingAsk` so the inline AskCard renders.
 *   4. Optionally schedule a timeout that resolves with `{timed_out: true}`.
 *   5. Await the resolver's promise. The user's click in <AskCard /> calls
 *      `resolveAskByCallId(...)`, fulfilling the promise.
 *   6. Sweep the card after a short delay so the UI shows a resolved state
 *      momentarily before fading.
 */

import type { ToolHandler } from "./types";
import type { UserArgs, AskUserResponse } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";
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

function kindFromUserType(t: UserArgs["type"]): PendingAskKind {
  return t as PendingAskKind;
}

function levelOrInfo(level?: string): PendingAskLevel {
  if (level === "info" || level === "success" || level === "warning" || level === "error") {
    return level;
  }
  return "info";
}

export const userHandler: ToolHandler<UserArgs, AskUserResponse> = {
  name: "user",
  async run(args, ctx) {
    const { callId, conversationId, dispatch } = ctx;

    const expiresAtMs =
      typeof args.timeout_seconds === "number"
        ? Date.now() + args.timeout_seconds * 1000
        : undefined;

    dispatch(
      enqueuePendingAsk({
        callId,
        conversationId,
        toolName: "user",
        kind: kindFromUserType(args.type),
        question: args.question,
        context: args.context,
        options: args.options,
        message: args.message,
        actions: args.actions,
        level: levelOrInfo(args.level),
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
  },
};
