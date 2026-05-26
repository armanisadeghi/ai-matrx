"use client";

// matrx-extend ↔ matrx-frontend bridge — visual end-to-end test harness.
//
// One page, four sections:
//   1. Connection panels (Direct RPC / Broadcast / Append API)
//   2. RPC test (action + payload, sends Direct or Broadcast)
//   3. Append-message form (cookie OR Bearer auth)
//   4. Live event log (every inbound + outbound event, color-coded)
//
// Routes used:
//   POST /api/extension/append-message  (Phase 2 endpoint)
//   chrome.runtime.sendMessage           (when the extension is loaded)
//   Supabase Broadcast on
//     `matrx-extension-bridge:<userId>`  (cross-machine)
//
// All wiring documented in docs/MATRX_EXTEND_CONNECTION.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { useExtensionBridgeChannel } from "@/hooks/useExtensionBridgeChannel";
import { ConnectionPanels } from "./ConnectionPanels";
import { RpcTestPanel } from "./RpcTestPanel";
import { AppendMessagePanel } from "./AppendMessagePanel";
import { LiveEventLog, type LogEntry } from "./LiveEventLog";
import { KNOWN_EXTENSION_IDS } from "./constants";

const MAX_LOG_ENTRIES = 200;

export default function ExtensionBridgeDemoPage() {
  const bridge = useExtensionBridgeChannel();
  const [extensionId, setExtensionId] = useState<string>(
    KNOWN_EXTENSION_IDS[0].id,
  );
  const [useBearerAuth, setUseBearerAuth] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logPaused, setLogPaused] = useState(false);
  const [bridgeLastInboundAt, setBridgeLastInboundAt] = useState<number | null>(
    null,
  );
  const [capabilitiesCache, setCapabilitiesCache] = useState<string[] | null>(
    null,
  );

  const logPausedRef = useRef(logPaused);
  logPausedRef.current = logPaused;

  const appendLog = useCallback((entry: Omit<LogEntry, "id">) => {
    if (logPausedRef.current) return;
    setLogEntries((prev) => {
      const next: LogEntry[] = [
        { ...entry, id: crypto.randomUUID() },
        ...prev,
      ];
      return next.slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  // Subscribe to inbound (extension->frontend) events for the live log.
  useEffect(() => {
    const off = bridge.onMessage((envelope) => {
      setBridgeLastInboundAt(Date.now());
      appendLog({
        ts: envelope.timestamp ?? Date.now(),
        kind: "broadcast-inbound",
        title: `${envelope.action} (rid ${envelope.requestId.slice(0, 8)}…)`,
        body: envelope,
      });
    });
    return off;
  }, [bridge, appendLog]);

  /** Send a Broadcast RPC and await the matching reply. */
  const sendBroadcast = useCallback(
    async (action: string, payload: unknown) => {
      const { promise } = await bridge.send(action, payload);
      try {
        const reply = await promise;
        return {
          ok: reply.ok,
          result: reply.result,
          error: reply.error,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [bridge],
  );

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold">
              Extension Bridge — visual test harness
            </h1>
            <p className="text-sm text-muted-foreground">
              End-to-end testing for the matrx-extend Chrome extension bridge.
              Direct RPC, Supabase Broadcast, and the append-message API in one
              page. See{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                docs/MATRX_EXTEND_CONNECTION.md
              </code>
              .
            </p>
          </header>

          <ConnectionPanels
            extensionId={extensionId}
            onExtensionIdChange={setExtensionId}
            bridgeReady={bridge.isReady}
            bridgeAuthenticated={bridge.isAuthenticated}
            bridgeLastInboundAt={bridgeLastInboundAt}
            useBearerAuth={useBearerAuth}
            onUseBearerAuthChange={setUseBearerAuth}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RpcTestPanel
              extensionId={extensionId}
              bridgeReady={bridge.isReady}
              bridgeAuthenticated={bridge.isAuthenticated}
              sendBroadcast={sendBroadcast}
              capabilitiesCache={capabilitiesCache}
              onCapabilitiesUpdate={setCapabilitiesCache}
              onCompleted={(entry) => {
                appendLog({
                  ts: entry.ts,
                  kind: entry.result.ok ? "rpc-success" : "rpc-error",
                  title: `${entry.substrate} → ${entry.action}${entry.result.latencyMs != null ? ` (${entry.result.latencyMs}ms)` : ""}`,
                  body: entry.result.ok
                    ? entry.result.data
                    : { error: entry.result.error, payload: entry.payload },
                });
              }}
            />
            <AppendMessagePanel
              useBearerAuth={useBearerAuth}
              onCompleted={(entry) => {
                appendLog({
                  ts: entry.ts,
                  kind: entry.ok ? "append-success" : "append-error",
                  title: `POST append-message → ${entry.status} (${entry.role}, ${entry.conversationId.slice(0, 8)}…)`,
                  body: entry.error
                    ? { error: entry.error }
                    : entry.response,
                });
              }}
            />
          </div>

          <LiveEventLog
            entries={logEntries}
            paused={logPaused}
            onTogglePaused={() => setLogPaused((p) => !p)}
            onClear={() => setLogEntries([])}
          />

          <DevHints />
        </div>
      </div>
    </div>
  );
}

/** Localhost-only pointers so the user doesn't have to remember anything. */
function DevHints() {
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") setShow(true);
  }, []);

  if (!show) return null;

  return (
    <details className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">
        Dev hints (localhost only)
      </summary>
      <ul className="ml-4 mt-2 list-disc space-y-1">
        <li>
          Auto-login bypass:{" "}
          <code className="rounded bg-background px-1">
            /api/dev-login?token=$DEV_LOGIN_TOKEN&amp;next=/tests/extension-bridge
          </code>
        </li>
        <li>
          Bearer mode requires{" "}
          <code className="rounded bg-background px-1">AGENT_API_KEY</code> from
          .env.local pasted into the token field.
        </li>
        <li>
          Broadcast substrate requires Supabase auth (signed-in user). Direct
          RPC works without auth but needs the extension installed.
        </li>
        <li>
          To trigger an inbound &quot;extension→frontend&quot; event, have the
          extension SW publish a Broadcast envelope with{" "}
          <code className="rounded bg-background px-1">
            direction: &quot;extension-&gt;frontend&quot;
          </code>{" "}
          on{" "}
          <code className="rounded bg-background px-1">
            matrx-extension-bridge:&lt;userId&gt;
          </code>
          .
        </li>
      </ul>
    </details>
  );
}
