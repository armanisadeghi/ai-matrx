"use client";

/**
 * Token Broker demo — a THIN test harness over `lib/api/broker/`.
 *
 * Everything here goes through the primitive (mint via the refresh-ahead
 * cache, mode-dispatch transport, hooks). If something needs logic that the
 * primitive doesn't expose, that's a gap in the primitive — extend it there,
 * not here.
 */

import React, { useState } from "react";
import {
  Coins,
  KeyRound,
  Loader2,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  clearBrokerCache,
  getBrokeredCredential,
  invalidateBrokeredCredential,
  reportCredentialRejected,
} from "@/lib/api/broker/cache";
import {
  useBrokerCacheSnapshot,
  useBrokeredCredential,
} from "@/lib/api/broker/hooks";
import { brokeredFetch } from "@/lib/api/broker/transport";
import {
  KNOWN_AUDIENCES,
  type BrokeredCredential,
  type CredentialRequest,
  type TierPolicy,
} from "@/lib/api/broker/types";
import { extractErrorMessage } from "@/utils/errors";

const TIER_POLICIES: TierPolicy[] = ["none", "guest", "mid"];

function maskToken(token: string): string {
  return `${token.slice(0, 10)}… (${token.length} chars)`;
}

function secondsUntil(epochMs: number): number {
  return Math.max(0, Math.round((epochMs - Date.now()) / 1000));
}

/** 1s ticker so countdowns move. */
function useNowTick(): number {
  const [now, setNow] = useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const inputCls =
  "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground";
const btnCls =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-foreground hover:bg-accent disabled:opacity-50";
const sectionCls = "rounded-lg border border-border bg-card p-4 space-y-3";

export default function TokenBrokerDemoPage() {
  // ── Mint form state ──────────────────────────────────────────────────────
  const [audience, setAudience] = useState<string>("anthropic");
  const [tierPolicy, setTierPolicy] = useState<TierPolicy>("none");
  const [model, setModel] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState("");
  const [scopes, setScopes] = useState("");
  const [minting, setMinting] = useState(false);
  const [lastCredential, setLastCredential] =
    useState<BrokeredCredential | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  const request: CredentialRequest = {
    audience,
    tierPolicy,
    model: model.trim() || undefined,
    scopes: scopes.trim()
      ? scopes.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    ttlSeconds: ttlSeconds.trim() ? Number(ttlSeconds) : undefined,
  };

  const mint = async (forceRefresh: boolean) => {
    setMinting(true);
    setMintError(null);
    try {
      const cred = await getBrokeredCredential(request, { forceRefresh });
      setLastCredential(cred);
      toast.success(
        `Minted ${cred.credential_mode} credential for "${cred.audience}"`,
      );
    } catch (err) {
      const msg = extractErrorMessage(err);
      setMintError(msg);
      toast.error(msg);
    } finally {
      setMinting(false);
    }
  };

  // ── Hook demo (auto-fresh credential for the current request) ───────────
  const [hookEnabled, setHookEnabled] = useState(false);
  const hook = useBrokeredCredential(hookEnabled ? request : null);

  // ── Cache inspector ──────────────────────────────────────────────────────
  const snapshot = useBrokerCacheSnapshot();
  const now = useNowTick();

  // ── Proxied live test (Anthropic gateway) ────────────────────────────────
  const [prompt, setPrompt] = useState("Reply with exactly: broker gateway OK");
  const [proxiedModel, setProxiedModel] = useState("claude-haiku-4-5-20251001");
  const [streamOut, setStreamOut] = useState("");
  const [streaming, setStreaming] = useState(false);

  const runProxiedCall = async (simulateRejection: boolean) => {
    setStreaming(true);
    setStreamOut("");
    try {
      const req: CredentialRequest = { audience: "anthropic", tierPolicy };
      if (simulateRejection) {
        // Evict whatever is cached so the transport's re-mint path exercises.
        const cred = await getBrokeredCredential(req);
        reportCredentialRejected(cred);
        toast.info("Cached credential evicted — transport must re-mint");
      }
      const res = await brokeredFetch(req, "/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          model: proxiedModel,
          max_tokens: 256,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Gateway responded ${res.status}: ${await res.text()}`);
      }
      // Anthropic SSE: accumulate text deltas.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let nl = buffer.indexOf("\n");
        while (nl !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line.startsWith("data:")) {
            try {
              const evt = JSON.parse(line.slice(5).trim()) as {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              const text =
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta"
                  ? evt.delta.text
                  : undefined;
              if (text) setStreamOut((s) => s + text);
            } catch {
              // ignore torn SSE line
            }
          }
          nl = buffer.indexOf("\n");
        }
      }
      toast.success("Proxied streaming call completed");
    } catch (err) {
      const msg = extractErrorMessage(err);
      setStreamOut((s) => s + `\n[error] ${msg}`);
      toast.error(msg);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">
          Token Broker — client primitive test
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Thin harness over <code>lib/api/broker/</code>. Mint scoped
        credentials, watch the refresh-ahead cache, and run a real
        provider-wire call through the proxied gateway.
      </p>

      {/* Mint */}
      <section className={sectionCls}>
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Coins className="h-4 w-4" /> Mint a credential
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Audience
            <input
              className={inputCls}
              list="known-audiences"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
            <datalist id="known-audiences">
              {KNOWN_AUDIENCES.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tier policy (required, no default in the API)
            <select
              className={inputCls}
              value={tierPolicy}
              onChange={(e) => setTierPolicy(e.target.value as TierPolicy)}
            >
              {TIER_POLICIES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Model (optional)
            <input
              className={inputCls}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="baked into grant"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            TTL seconds (optional)
            <input
              className={inputCls}
              value={ttlSeconds}
              onChange={(e) => setTtlSeconds(e.target.value)}
              placeholder="server default"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Scopes (comma-sep, optional)
            <input
              className={inputCls}
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
            />
          </label>
          <button className={btnCls} disabled={minting} onClick={() => void mint(false)}>
            {minting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Mint (cached)
          </button>
          <button className={btnCls} disabled={minting} onClick={() => void mint(true)}>
            <RefreshCcw className="h-4 w-4" /> Force re-mint
          </button>
        </div>
        {mintError && (
          <p className="text-sm text-destructive">{mintError}</p>
        )}
        {lastCredential && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Mode</dt>
              <dd className="text-foreground">{lastCredential.credential_mode}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Protocol</dt>
              <dd className="text-foreground">{lastCredential.protocol}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Model</dt>
              <dd className="text-foreground">{lastCredential.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Expires in</dt>
              <dd className="text-foreground">
                {secondsUntil(lastCredential.expires_at * 1000)}s
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Endpoint (data, never hardcoded)</dt>
              <dd className="break-all text-foreground">{lastCredential.endpoint}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Token (masked — never rendered raw)</dt>
              <dd className="text-foreground">{maskToken(lastCredential.token)}</dd>
            </div>
            <div className="col-span-2 md:col-span-4">
              <dt className="text-xs text-muted-foreground">Grant</dt>
              <dd className="text-foreground">
                tier={lastCredential.grant.tier_policy} · scopes=[
                {(lastCredential.grant.scopes ?? []).join(", ")}] · user=
                {lastCredential.grant.user_id}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* Hook */}
      <section className={sectionCls}>
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <RefreshCcw className="h-4 w-4" /> useBrokeredCredential (auto-fresh)
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <button className={btnCls} onClick={() => setHookEnabled((v) => !v)}>
            {hookEnabled ? "Disable" : "Enable"} hook for current request
          </button>
          <span className="text-muted-foreground">
            status: <span className="text-foreground">{hook.status}</span>
            {hook.credential &&
              ` · expires in ${secondsUntil(hook.credential.expires_at * 1000)}s`}
            {hook.error && ` · ${hook.error.message}`}
          </span>
          {hookEnabled && (
            <button className={btnCls} onClick={hook.refresh}>
              Refresh now
            </button>
          )}
        </div>
      </section>

      {/* Cache inspector */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">
            Cache inspector ({snapshot.length} entr{snapshot.length === 1 ? "y" : "ies"})
          </h2>
          <button className={btnCls} onClick={clearBrokerCache}>
            <Trash2 className="h-4 w-4" /> Clear all
          </button>
        </div>
        {snapshot.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing cached.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pr-4 font-normal">Key</th>
                  <th className="pr-4 font-normal">Mode</th>
                  <th className="pr-4 font-normal">Fresh for</th>
                  <th className="pr-4 font-normal">Expires in</th>
                  <th className="font-normal" />
                </tr>
              </thead>
              <tbody>
                {snapshot.map((e) => (
                  <tr key={e.key} className="border-t border-border">
                    <td className="break-all pr-4 py-1 font-mono text-xs text-foreground">
                      {e.key}
                    </td>
                    <td className="pr-4 text-foreground">
                      {e.credential.credential_mode}
                    </td>
                    <td className="pr-4 text-foreground">
                      {secondsUntil(e.freshUntil)}s
                    </td>
                    <td className="pr-4 text-foreground">
                      {secondsUntil(e.credential.expires_at * 1000)}s
                    </td>
                    <td className="py-1">
                      <button
                        className={btnCls}
                        onClick={() => reportCredentialRejected(e.credential)}
                      >
                        <XCircle className="h-4 w-4" /> Evict
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground" data-now={now}>
          Entries re-mint automatically once &lt;20% of TTL remains. Evicting
          simulates a 401 — the next call re-mints exactly once.
        </p>
      </section>

      {/* Proxied live test */}
      <section className={sectionCls}>
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Send className="h-4 w-4" /> Live proxied call — Anthropic gateway
        </h2>
        <p className="text-xs text-muted-foreground">
          Provider-wire <code>POST /v1/messages</code> (streaming SSE) against
          <code> credential.endpoint</code> via <code>brokeredFetch</code>. The
          real API key never leaves the server.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-72 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Prompt
            <input
              className={inputCls}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Model (request body)
            <input
              className={inputCls}
              value={proxiedModel}
              onChange={(e) => setProxiedModel(e.target.value)}
            />
          </label>
          <button
            className={btnCls}
            disabled={streaming}
            onClick={() => void runProxiedCall(false)}
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </button>
          <button
            className={btnCls}
            disabled={streaming}
            onClick={() => void runProxiedCall(true)}
          >
            <XCircle className="h-4 w-4" /> Send after forced eviction
          </button>
        </div>
        {streamOut && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-sm text-foreground">
            {streamOut}
          </pre>
        )}
      </section>
    </div>
  );
}
