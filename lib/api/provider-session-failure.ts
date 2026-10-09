/**
 * lib/api/provider-session-failure.ts
 *
 * THE frontend glue for browser-held provider sessions (xAI realtime voice,
 * Cartesia TTS — and OpenAI realtime when a browser session exists). The
 * browser talks to the provider directly on a broker-minted ephemeral token,
 * so a provider refusal (e.g. the platform account is out of credit) never
 * touches the server. Every such session's error handler reports through here:
 *
 *   - the server records it (the operator hears about out-of-credit refusals),
 *   - and answers with the sentence to show the person + whether a reconnect
 *     can help. Sessions show `user_message` instead of the provider's raw
 *     text, and never auto-reconnect when `retryable` is false.
 *
 * Package truth: `reportProviderSessionFailure` in `@ai-matrx/agents/matrx`
 * (`POST /broker/provider-failures`, never throws, null = report failed →
 * the caller shows its existing fallback).
 */

import type { Action } from "redux";
import type { ThunkAction } from "redux-thunk";
import type { RootState } from "@/lib/redux/store";
import {
  reportProviderSessionFailure,
  type ProviderSessionFailure,
  type ProviderSessionFailureVerdict,
} from "@ai-matrx/agents/matrx";
import { waitForAuthReady } from "@/lib/api/call-api";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { getStoreSingleton } from "@/lib/redux/store-singleton";

export type { ProviderSessionFailure, ProviderSessionFailureVerdict };

/**
 * Report a browser-held provider session failure over the global transport.
 * Resolves the server's verdict, or null when the report itself could not be
 * made (no session, no organization, network) — never throws.
 */
export function reportBrowserProviderFailure(
  failure: ProviderSessionFailure,
): ThunkAction<
  Promise<ProviderSessionFailureVerdict | null>,
  RootState,
  unknown,
  Action
> {
  return async (_dispatch, getState) => {
    try {
      await waitForAuthReady(getState);
      const transport = createMatrxTransport(getState, {
        source: "providerSessionFailure",
      });
      return await reportProviderSessionFailure(transport, failure);
    } catch (error) {
      console.warn(
        `[provider-session-failure] could not report a ${failure.provider} failure`,
        error,
      );
      return null;
    }
  };
}

/**
 * The same report for React-free modules (e.g. the Cartesia connection
 * funnel) that have no `dispatch` — rides the runtime store singleton.
 */
export async function reportBrowserProviderFailureFromStore(
  failure: ProviderSessionFailure,
): Promise<ProviderSessionFailureVerdict | null> {
  const store = getStoreSingleton();
  if (!store) {
    console.warn(
      `[provider-session-failure] no store — ${failure.provider} failure not reported`,
    );
    return null;
  }
  const thunk = reportBrowserProviderFailure(failure);
  return thunk(
    store.dispatch,
    store.getState as () => RootState,
    undefined,
  );
}
