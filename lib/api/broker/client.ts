/**
 * lib/api/broker/client.ts
 *
 * The ONE mint call. Everything in this repo that needs a brokered credential
 * goes through `mintCredential` (usually indirectly, via the cache in
 * `cache.ts` — feature code should almost never call this directly).
 *
 * Failure surface (per the cross-repo contract):
 *   - 503  → broker not configured on that server. Loud, user-visible,
 *            NEVER a silent fallback to another auth path.
 *   - 422  → unknown audience / missing tier_policy — a programming error.
 *   - 401  → no session; surfaces as the standard auth error.
 */

import { apiPost } from "@/lib/api/typed-client";
import { BackendApiError } from "@/lib/api/errors";
import type {
  BrokeredCredential,
  BrokerAudience,
  CredentialRequest,
  TierPolicy,
} from "@/lib/api/broker/types";

export interface MintOptions {
  model?: string;
  scopes?: string[];
  ttlSeconds?: number;
  signal?: AbortSignal;
}

/**
 * Mint a scoped short-lived credential. `tierPolicy` is a required positional
 * argument on purpose — the explicit-access contract forbids a default.
 */
export async function mintCredential(
  audience: BrokerAudience,
  tierPolicy: TierPolicy,
  opts: MintOptions = {},
): Promise<BrokeredCredential> {
  try {
    const { data } = await apiPost(
      "/broker/tokens",
      {
        audience,
        tier_policy: tierPolicy,
        ttl_seconds: opts.ttlSeconds ?? null,
        model: opts.model ?? null,
        scopes: opts.scopes ?? [],
      },
      { signal: opts.signal },
    );
    return data;
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 503) {
      // Re-shape so every consumer surfaces the same loud, actionable message.
      throw new BackendApiError({
        code: err.code,
        detail: `Token broker unavailable for audience "${audience}": ${err.detail}`,
        userMessage:
          "Secure credential service is not available on this server. This is a configuration problem — please report it.",
        details: err.details,
        requestId: err.requestId,
        status: 503,
      });
    }
    throw err;
  }
}

/** Convenience overload taking the full CredentialRequest shape. */
export function mintFromRequest(
  req: CredentialRequest,
  signal?: AbortSignal,
): Promise<BrokeredCredential> {
  return mintCredential(req.audience, req.tierPolicy, {
    model: req.model,
    scopes: req.scopes,
    ttlSeconds: req.ttlSeconds,
    signal,
  });
}
