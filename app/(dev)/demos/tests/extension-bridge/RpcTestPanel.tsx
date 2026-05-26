"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, ChevronDown, ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { sendChromeRpc, isChromeRpcAvailable } from "./chrome-rpc";
import { DEFAULT_PAYLOADS, RPC_ACTIONS, type RpcAction } from "./constants";
import { JsonViewer } from "./JsonViewer";

type Substrate = "direct" | "broadcast";

interface HistoryEntry {
  id: string;
  ts: number;
  substrate: Substrate;
  action: RpcAction | string;
  payload: unknown;
  result: { ok: boolean; data?: unknown; error?: string; latencyMs?: number };
}

export interface RpcTestPanelProps {
  extensionId: string;
  bridgeReady: boolean;
  bridgeAuthenticated: boolean;
  /** Send via Supabase Broadcast and resolve with the matching reply. */
  sendBroadcast: (
    action: string,
    payload: unknown,
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  /** Notify the parent of a new completed RPC for the live event log. */
  onCompleted: (entry: HistoryEntry) => void;
  /** Capabilities catalog from the most-recent successful capabilities call. */
  capabilitiesCache: string[] | null;
  onCapabilitiesUpdate: (toolNames: string[]) => void;
}

export function RpcTestPanel({
  extensionId,
  bridgeReady,
  bridgeAuthenticated,
  sendBroadcast,
  onCompleted,
  capabilitiesCache,
  onCapabilitiesUpdate,
}: RpcTestPanelProps) {
  const [substrate, setSubstrate] = useState<Substrate>("direct");
  const [action, setAction] = useState<RpcAction>("ping");
  const [payloadJson, setPayloadJson] = useState<string>(DEFAULT_PAYLOADS.ping);
  const [sending, setSending] = useState(false);
  const [latestResult, setLatestResult] = useState<HistoryEntry | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(
    new Set(),
  );

  const chromeAvailable = useMemo(() => isChromeRpcAvailable(), []);

  // Reset payload to default when action changes (only if user hasn't
  // diverged from the previous default).
  useEffect(() => {
    setPayloadJson((current) => {
      const previousDefaults = Object.values(DEFAULT_PAYLOADS);
      // If current value matches any default, swap to new action's default;
      // otherwise leave the user's edits alone.
      if (previousDefaults.includes(current)) {
        return DEFAULT_PAYLOADS[action];
      }
      return current;
    });
    setParseError(null);
  }, [action]);

  const handleSend = async () => {
    setParseError(null);
    let payload: unknown;
    try {
      payload = payloadJson.trim() ? JSON.parse(payloadJson) : {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid JSON";
      setParseError(msg);
      toast.error(`Payload is not valid JSON: ${msg}`);
      return;
    }

    // For callTool with cached capabilities, lightly validate toolName.
    if (action === "callTool" && capabilitiesCache && capabilitiesCache.length) {
      const toolName = (payload as { toolName?: string })?.toolName;
      if (toolName && !capabilitiesCache.includes(toolName)) {
        toast.warning(
          `'${toolName}' isn't in the cached capabilities catalog — sending anyway`,
        );
      }
    }

    setSending(true);
    const start = performance.now();
    let result: HistoryEntry["result"];
    try {
      if (substrate === "direct") {
        if (!chromeAvailable) {
          result = {
            ok: false,
            error:
              "chrome.runtime API unavailable — Direct RPC needs Chromium + extension installed",
          };
        } else {
          const r = await sendChromeRpc(extensionId, action, payload);
          result = {
            ok: r.ok,
            data: r.result,
            error: r.error,
            latencyMs: r.latencyMs,
          };
        }
      } else {
        if (!bridgeAuthenticated) {
          result = {
            ok: false,
            error: "Not signed in — Broadcast channel requires a Supabase user",
          };
        } else if (!bridgeReady) {
          result = {
            ok: false,
            error: "Broadcast channel not ready yet — wait a moment and retry",
          };
        } else {
          const r = await sendBroadcast(action, payload);
          result = {
            ok: r.ok,
            data: r.result,
            error: r.error,
            latencyMs: Math.round(performance.now() - start),
          };
        }
      }
    } catch (err) {
      result = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Math.round(performance.now() - start),
      };
    } finally {
      setSending(false);
    }

    // Auto-cache the catalog from successful capabilities calls. The
    // extension's capabilities reply shape is { tools: [{name, ...}] }.
    if (action === "capabilities" && result.ok && result.data) {
      const data = result.data as {
        tools?: Array<{ name?: string }>;
        toolNames?: string[];
      };
      const names: string[] = Array.isArray(data?.toolNames)
        ? data.toolNames.filter((n): n is string => typeof n === "string")
        : Array.isArray(data?.tools)
          ? data.tools
              .map((t) => t?.name)
              .filter((n): n is string => typeof n === "string")
          : [];
      if (names.length) {
        onCapabilitiesUpdate(names);
        toast.success(`Cached ${names.length} tools from capabilities reply`);
      }
    }

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      substrate,
      action,
      payload,
      result,
    };
    setLatestResult(entry);
    setHistory((prev) => [entry, ...prev].slice(0, 10));
    onCompleted(entry);

    if (result.ok) {
      toast.success(`${action} → ok (${result.latencyMs ?? "?"}ms)`);
    } else {
      toast.error(`${action} → ${result.error ?? "error"}`);
    }
  };

  const toggleHistoryRow = (id: string) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4 text-muted-foreground" />
          RPC test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Substrate radio + action select on one row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">Substrate</Label>
            <RadioGroup
              value={substrate}
              onValueChange={(v) => setSubstrate(v as Substrate)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="direct" id="sub-direct" />
                <Label htmlFor="sub-direct" className="cursor-pointer text-xs">
                  Direct (chrome.runtime)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="broadcast" id="sub-broadcast" />
                <Label
                  htmlFor="sub-broadcast"
                  className="cursor-pointer text-xs"
                >
                  Broadcast (Supabase)
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rpc-action" className="text-xs">
              Action
            </Label>
            <select
              id="rpc-action"
              value={action}
              onChange={(e) => setAction(e.target.value as RpcAction)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {RPC_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Payload editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="rpc-payload" className="text-xs">
              Payload (JSON)
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setPayloadJson(DEFAULT_PAYLOADS[action])}
            >
              Reset to default
            </Button>
          </div>
          <Textarea
            id="rpc-payload"
            value={payloadJson}
            onChange={(e) => setPayloadJson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
          />
          {parseError && (
            <p className="text-xs text-destructive">JSON error: {parseError}</p>
          )}
          {action === "callTool" &&
            capabilitiesCache &&
            capabilitiesCache.length > 0 && (
              <CallToolHelper
                catalog={capabilitiesCache}
                onPick={(toolName) => {
                  // Update the toolName field in the current payload.
                  try {
                    const p = JSON.parse(payloadJson || "{}");
                    p.toolName = toolName;
                    if (!("args" in p)) p.args = {};
                    setPayloadJson(JSON.stringify(p, null, 2));
                  } catch {
                    setPayloadJson(
                      JSON.stringify({ toolName, args: {} }, null, 2),
                    );
                  }
                }}
              />
            )}
        </div>

        <Button
          type="button"
          onClick={handleSend}
          disabled={
            sending ||
            (substrate === "direct" && !chromeAvailable) ||
            (substrate === "broadcast" && !bridgeAuthenticated)
          }
          className="w-full sm:w-auto"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {sending ? "Sending…" : "Send RPC"}
        </Button>

        {/* Latest result */}
        {latestResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Latest reply</Label>
              <Badge variant={latestResult.result.ok ? "success" : "destructive"}>
                {latestResult.result.ok ? "ok" : "error"}
              </Badge>
              {latestResult.result.latencyMs != null && (
                <Badge variant="outline">{latestResult.result.latencyMs}ms</Badge>
              )}
              <Badge variant="outline">{latestResult.substrate}</Badge>
            </div>
            <JsonViewer
              value={
                latestResult.result.ok
                  ? latestResult.result.data
                  : { error: latestResult.result.error }
              }
            />
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs">Recent calls ({history.length}/10)</Label>
            </div>
            <div className="divide-y divide-border rounded-md border border-border">
              {history.map((h) => {
                const open = expandedHistory.has(h.id);
                return (
                  <div key={h.id} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleHistoryRow(h.id)}
                      className="flex w-full items-center gap-2 text-left text-xs hover:text-primary"
                    >
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <span className="font-mono text-muted-foreground">
                        {new Date(h.ts).toLocaleTimeString()}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {h.substrate}
                      </Badge>
                      <span className="font-medium">{h.action}</span>
                      <Badge
                        variant={h.result.ok ? "success" : "destructive"}
                        className="ml-auto text-[10px]"
                      >
                        {h.result.ok ? "ok" : "err"}
                      </Badge>
                    </button>
                    {open && (
                      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[10px] uppercase text-muted-foreground">
                            request
                          </p>
                          <JsonViewer value={h.payload} maxHeight="max-h-48" />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] uppercase text-muted-foreground">
                            reply
                          </p>
                          <JsonViewer
                            value={
                              h.result.ok
                                ? h.result.data
                                : { error: h.result.error }
                            }
                            maxHeight="max-h-48"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CallToolHelper({
  catalog,
  onPick,
}: {
  catalog: string[];
  onPick: (toolName: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Pick a tool from the cached capabilities catalog ({catalog.length}{" "}
        available):
      </p>
      <select
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
        defaultValue=""
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">— choose a tool —</option>
        {catalog.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
