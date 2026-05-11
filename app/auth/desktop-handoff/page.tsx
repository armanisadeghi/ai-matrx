"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { extractErrorMessage } from "@/utils/errors";

type LogEntry = { ts: string; ok: boolean; msg: string };

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

export default function DesktopHandoffPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const ranRef = useRef(false);

  const log = (ok: boolean, msg: string) =>
    setLogs((prev) => [...prev, { ts: ts(), ok, msg }]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    async function run() {
      // ── Step 1: Parse URL params ────────────────────────────────────
      const search = window.location.search;
      const urlParams = new URLSearchParams(search);
      const accessToken = urlParams.get("access_token") ?? "";
      const refreshToken = urlParams.get("refresh_token") ?? "";
      const redirect = urlParams.get("redirect") ?? "/";

      const paramSnapshot: Record<string, string> = {
        "Full URL":
          window.location.href.slice(0, 120) +
          (window.location.href.length > 120 ? "…" : ""),
        access_token: accessToken
          ? `✓ present (${accessToken.length} chars, starts: ${accessToken.slice(0, 20)}…)`
          : "✗ MISSING",
        refresh_token: refreshToken
          ? `✓ present (${refreshToken.length} chars, value: ${refreshToken})`
          : "✗ MISSING",
        redirect: redirect || "(empty — will use /)",
      };
      setParams(paramSnapshot);

      log(true, "STEP 1 — URL params parsed");
      log(!!accessToken, `access_token:  ${paramSnapshot["access_token"]}`);
      log(!!refreshToken, `refresh_token: ${paramSnapshot["refresh_token"]}`);
      log(true, `redirect:      ${redirect}`);

      if (!accessToken || !refreshToken) {
        log(
          false,
          "STOPPING — tokens missing. The desktop app did not pass them correctly.",
        );
        return;
      }

      // ── Step 2: Create Supabase client ──────────────────────────────
      log(true, "STEP 2 — Creating Supabase browser client…");
      const supabase = createClient();
      log(
        true,
        `Supabase client created — URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40)}`,
      );

      // ── Step 3: Try setSession first ────────────────────────────────
      // The desktop app stores the session manually via localStorage (bypassing
      // supabase.auth.setSession) so the refresh_token may be a raw OAuth token
      // rather than a Supabase-managed refresh token. We try setSession first,
      // and if it fails with "Auth session missing" we fall back to refreshing
      // via the Supabase token endpoint directly.
      log(true, "STEP 3 — Trying supabase.auth.setSession()…");
      const { data: setData, error: setError } = await supabase.auth.setSession(
        {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      );

      if (!setError && setData.session) {
        log(
          true,
          `setSession OK — user: ${setData.session.user?.email ?? "(no email)"}`,
        );
        log(true, `expires_at: ${setData.session.expires_at}`);
      } else {
        log(
          false,
          `setSession failed: ${setError?.message ?? "no session returned"}`,
        );
        log(
          true,
          "STEP 3b — Falling back: calling Supabase token refresh endpoint directly…",
        );

        // Hit the Supabase REST endpoint to exchange the refresh token
        // for a full session. This works even when the refresh token was
        // stored via a manual localStorage write rather than setSession.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        // API keys: ONLY sb_publishable_*. Legacy ANON_KEY is BANNED.
        // Docs: https://supabase.com/docs/guides/getting-started/api-keys
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

        log(true, `POST ${supabaseUrl}/auth/v1/token?grant_type=refresh_token`);

        let refreshResp: Response;
        try {
          refreshResp = await fetch(
            `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: supabaseKey,
              },
              body: JSON.stringify({ refresh_token: refreshToken }),
            },
          );
        } catch (e) {
          log(false, `fetch threw: ${extractErrorMessage(e)}`);
          return;
        }

        const refreshBody = (await refreshResp
          .json()
          .catch(() => ({}))) as Record<string, unknown>;
        log(refreshResp.ok, `Token endpoint status: ${refreshResp.status}`);
        log(
          refreshResp.ok,
          `Response keys: ${Object.keys(refreshBody).join(", ")}`,
        );

        if (!refreshResp.ok || !refreshBody.access_token) {
          log(false, `Token refresh failed: ${JSON.stringify(refreshBody)}`);
          log(false, "STOPPING — cannot establish session. See errors above.");
          return;
        }

        log(
          true,
          `Got new access_token (${String(refreshBody.access_token).length} chars)`,
        );
        log(
          true,
          `Got new refresh_token (${String(refreshBody.refresh_token ?? "").length} chars)`,
        );

        // Now inject the freshly obtained tokens into the Supabase client
        log(true, "Calling setSession with freshly obtained tokens…");
        const { data: retryData, error: retryError } =
          await supabase.auth.setSession({
            access_token: refreshBody.access_token as string,
            refresh_token: refreshBody.refresh_token as string,
          });

        if (retryError || !retryData.session) {
          log(
            false,
            `setSession retry failed: ${retryError?.message ?? "no session"}`,
          );
          log(false, "STOPPING.");
          return;
        }

        log(
          true,
          `setSession retry OK — user: ${retryData.session.user?.email}`,
        );
      }

      // ── Step 4: Verify ──────────────────────────────────────────────
      log(true, "STEP 4 — Verifying with getSession()…");
      const { data: check } = await supabase.auth.getSession();
      if (check.session) {
        log(true, `getSession OK — user: ${check.session.user?.email}`);
      } else {
        log(false, "getSession returned null — session was not persisted!");
      }

      // ── Step 5: Wait for SSR cookie ─────────────────────────────────
      log(true, "STEP 5 — Waiting 800ms for SSR cookie to be written…");
      await new Promise((r) => setTimeout(r, 800));
      log(true, "Wait complete.");

      // ── Step 6: Navigate ────────────────────────────────────────────
      log(true, `STEP 6 — Navigating to: ${redirect}`);
      setDone(true);
      await new Promise((r) => setTimeout(r, 1500));
      window.location.href = redirect;
    }

    run();
  }, []);

  const hasError = logs.some((l) => !l.ok);

  return (
    <div
      style={{
        fontFamily: "monospace",
        padding: "16px",
        background: "#0a0a0a",
        minHeight: "100dvh",
        color: "#e2e8f0",
      }}
    >
      <div
        style={{
          marginBottom: "12px",
          fontSize: "18px",
          fontWeight: "bold",
          color: "#60a5fa",
        }}
      >
        🔐 Desktop Auth Handoff — Debug Console
      </div>

      {/* URL Params table */}
      <div
        style={{
          background: "#111827",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "12px",
          border: "1px solid #1f2937",
        }}
      >
        <div
          style={{
            color: "#9ca3af",
            fontSize: "11px",
            marginBottom: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          URL Parameters Received
        </div>
        {Object.entries(params).map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              gap: "8px",
              fontSize: "12px",
              marginBottom: "4px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ color: "#6b7280", minWidth: "140px", flexShrink: 0 }}
            >
              {k}:
            </span>
            <span
              style={{
                color: v.startsWith("✗") ? "#f87171" : "#86efac",
                wordBreak: "break-all",
              }}
            >
              {v}
            </span>
          </div>
        ))}
        {Object.keys(params).length === 0 && (
          <div style={{ color: "#6b7280", fontSize: "12px" }}>Parsing…</div>
        )}
      </div>

      {/* Log stream */}
      <div
        style={{
          background: "#111827",
          borderRadius: "8px",
          padding: "12px",
          border: "1px solid #1f2937",
        }}
      >
        <div
          style={{
            color: "#9ca3af",
            fontSize: "11px",
            marginBottom: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Execution Log
        </div>
        {logs.map((entry, i) => (
          <div
            key={i}
            style={{
              fontSize: "12px",
              marginBottom: "3px",
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#4b5563", flexShrink: 0 }}>{entry.ts}</span>
            <span
              style={{ color: entry.ok ? "#4ade80" : "#f87171", flexShrink: 0 }}
            >
              {entry.ok ? "✓" : "✗"}
            </span>
            <span
              style={{
                color: entry.ok ? "#e2e8f0" : "#fca5a5",
                wordBreak: "break-all",
              }}
            >
              {entry.msg}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: "12px" }}>Starting…</div>
        )}
      </div>

      {done && !hasError && (
        <div
          style={{
            marginTop: "12px",
            background: "#052e16",
            border: "1px solid #166534",
            borderRadius: "8px",
            padding: "12px",
            color: "#86efac",
            fontSize: "13px",
          }}
        >
          ✓ Auth complete — navigating in 1.5s…
        </div>
      )}
      {hasError && !done && (
        <div
          style={{
            marginTop: "12px",
            background: "#450a0a",
            border: "1px solid #991b1b",
            borderRadius: "8px",
            padding: "12px",
            color: "#fca5a5",
            fontSize: "13px",
          }}
        >
          ✗ Auth failed — page will NOT navigate. Screenshot this entire page
          and share it.
        </div>
      )}
    </div>
  );
}
