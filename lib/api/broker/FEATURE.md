# Token Broker Client — `lib/api/broker/`

**Status:** Live. The browser-side primitive for scoped, short-lived, tier-governed credentials minted by aidream (`POST /broker/tokens`). Any surface needing temporary privileged reach — provider realtime sessions, direct provider API calls — consumes THIS module. **Never hand-roll a mint call, cache, or gateway fetch.**

Cross-repo system of record: `/Users/armanisadeghi/code/common-docs/systems/token-broker/FEATURE.md`. Server growth (new providers/audiences): global `token-broker` skill — **server-first, always**. Repo consumption rules: `.claude/skills/token-broker-client/SKILL.md`.

## The module

| File | Owns |
|---|---|
| `types.ts` | Envelope types derived from generated OpenAPI (`BrokeredCredential`, `MintTokenRequest`, `TierPolicy`, `CredentialRequest`), `KNOWN_AUDIENCES` |
| `client.ts` | `mintCredential(audience, tierPolicy, opts)` — the ONE mint call (via `typed-client`); 503 → loud "broker unconfigured" error |
| `cache.ts` | `getBrokeredCredential(req)` — in-memory refresh-ahead cache (re-mint at <20% TTL), in-flight dedup, `reportCredentialRejected`, auto-clear on Supabase `SIGNED_OUT`; `acquireCredentialLease(req)` — refcounted keep-fresh loop for long-lived consumers (React or not); `peekBrokerCache`/`subscribeBrokerCache` for debug UIs |
| `transport.ts` | Mode dispatch: `brokeredFetch`/`createBrokeredFetch` (proxied — provider-wire HTTP to `credential.endpoint`, one re-mint on 401 then loud fail) and `resolveBrokeredTransport` (discriminated union incl. `native_ephemeral` handoff) |
| `hooks.ts` | `useBrokeredCredential(req)` — holds a lease for the component's lifetime, reads via `useSyncExternalStore`; `useBrokerCacheSnapshot()` — debug only |

## How to consume

- **One-shot / imperative (most callers):** `brokeredFetch({ audience: "anthropic", tierPolicy: "none", model }, "/v1/messages", { method: "POST", body })` — returns raw `Response`, stream the body freely.
- **Realtime / native:** `const t = await resolveBrokeredTransport({ audience: "openai_realtime", tierPolicy: "none", model }); if (t.mode === "native_ephemeral") connect(t.endpoint, t.token)`.
- **Component-lifetime freshness:** `useBrokeredCredential(req)`.

## Invariants (violating any is a defect)

- **`tierPolicy` is a required explicit argument everywhere — no default at any layer.**
- **Tokens live in module memory only.** Never localStorage/Redux-persist/DB/logs. Never render `credential.token` (mask it).
- **`endpoint` is data from the credential** — never hardcode a gateway or provider URL client-side.
- **No raw provider key in client env/config, ever.** Missing capability → new audience server-side first (global `token-broker` skill), never a client workaround.
- **503 from mint = broker unconfigured → loud error, no silent fallback; no retry loop.**
- **401 from a credential's endpoint → exactly one re-mint, then loud failure.**

## Testing

Demo page: `/demos/token-broker` (dev builds) — mint per audience/tier, cache inspection, live proxied Anthropic streaming call, forced-401 re-mint check.

## Change Log

- 2026-07-12 — Created: full client primitive (types/client/cache/transport/hooks) + demo page; audiences live: `openai_realtime` (native), `anthropic` (proxied).
