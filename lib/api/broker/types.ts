/**
 * lib/api/broker/types.ts
 *
 * Typed envelope for the Token Broker — scoped, short-lived, tier-governed
 * credentials minted by aidream (`POST /broker/tokens`).
 *
 * Every type here is DERIVED from the generated OpenAPI contract
 * (`types/python-generated/api-types.ts`) — never hand-mirrored. When the
 * server contract changes, `pnpm sync-types` makes drift a compile error.
 *
 * Cross-repo system of record:
 *   /Users/armanisadeghi/code/common-docs/token-broker/FEATURE.md
 */

import type { components } from "@/types/python-generated/api-types";

/** The one envelope for every brokered credential, regardless of mode. */
export type BrokeredCredential = components["schemas"]["BrokeredCredential"];

/** What was granted — embedded in every credential for display/debugging. */
export type BrokeredGrant = components["schemas"]["BrokeredGrant"];

/** Body of `POST /broker/tokens`. */
export type MintTokenRequest = components["schemas"]["MintTokenRequest"];

/**
 * `"none" | "guest" | "mid"` — REQUIRED on every mint, no default, by design.
 * It is signed into the grant and enforced server-side; a downgraded grant
 * cannot reach a premium model. Never bake a default anywhere in this repo.
 */
export type TierPolicy = MintTokenRequest["tier_policy"];

/** `"native_ephemeral"` (real provider token) | `"proxied"` (our scoped JWT). */
export type CredentialMode = BrokeredCredential["credential_mode"];

/**
 * Audiences the server supports TODAY. This list is DX only — the audience
 * space is open (the server's minter registry is the source of truth), so
 * `BrokerAudience` accepts any string. A new audience is added SERVER-FIRST
 * (global `token-broker` skill), then consumed here with zero primitive
 * changes.
 */
export const KNOWN_AUDIENCES = ["openai_realtime", "anthropic"] as const;
export type KnownAudience = (typeof KNOWN_AUDIENCES)[number];
export type BrokerAudience = KnownAudience | (string & {});

/**
 * The full identity of a credential need. This is the cache key AND the mint
 * request: two callers asking for the same CredentialRequest share one
 * credential; anything that differs gets its own.
 */
export interface CredentialRequest {
  audience: BrokerAudience;
  /** Explicit, always. No default exists at any layer. */
  tierPolicy: TierPolicy;
  /** Model to bake into the credential (tier-resolved server-side). */
  model?: string;
  /** Narrowing scopes, if the audience defines any. */
  scopes?: string[];
  /** Requested TTL; the server clamps to the audience's bounds. */
  ttlSeconds?: number;
}

/** A cached credential plus the timing metadata refresh-ahead needs. */
export interface CachedCredential {
  credential: BrokeredCredential;
  /** Epoch ms when we received the credential. */
  mintedAt: number;
  /** Epoch ms after which the cache treats it as stale (refresh-ahead). */
  freshUntil: number;
}
