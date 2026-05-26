"use client";

import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Plug,
  Radio,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  selectUserId,
  selectUserEmail,
  selectUserName,
} from "@/lib/redux/selectors/userSelectors";
import {
  detectExtensionId,
  isChromeRpcAvailable,
  sendChromeRpc,
} from "./chrome-rpc";
import { KNOWN_EXTENSION_IDS, APPEND_MESSAGE_ENDPOINT } from "./constants";

type DirectStatus = "unknown" | "checking" | "connected" | "not-detected";

export interface ConnectionPanelsProps {
  /** Currently active extension ID (used by other panels). */
  extensionId: string;
  onExtensionIdChange: (id: string) => void;
  /** Bridge ready state from useExtensionBridgeChannel. */
  bridgeReady: boolean;
  bridgeAuthenticated: boolean;
  bridgeLastInboundAt: number | null;
  /** Bearer auth toggle for the append-message panel. */
  useBearerAuth: boolean;
  onUseBearerAuthChange: (next: boolean) => void;
}

export function ConnectionPanels({
  extensionId,
  onExtensionIdChange,
  bridgeReady,
  bridgeAuthenticated,
  bridgeLastInboundAt,
  useBearerAuth,
  onUseBearerAuthChange,
}: ConnectionPanelsProps) {
  const userId = useSelector(selectUserId);
  const userEmail = useSelector(selectUserEmail);
  const userName = useSelector(selectUserName);

  const [directStatus, setDirectStatus] = useState<DirectStatus>("unknown");
  const [detectedLatencyMs, setDetectedLatencyMs] = useState<number | null>(
    null,
  );
  const [detecting, setDetecting] = useState(false);
  const [customId, setCustomId] = useState("");
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<{
    status: number;
    body: string;
  } | null>(null);

  const chromeAvailable = useMemo(() => isChromeRpcAvailable(), []);

  const runDetect = async () => {
    if (!chromeAvailable) {
      setDirectStatus("not-detected");
      return;
    }
    setDetecting(true);
    setDirectStatus("checking");
    try {
      const candidates = [
        ...KNOWN_EXTENSION_IDS.map((k) => k.id),
        ...(customId.trim() ? [customId.trim()] : []),
      ];
      const found = await detectExtensionId(candidates);
      if (found) {
        onExtensionIdChange(found.id);
        setDetectedLatencyMs(found.latencyMs ?? null);
        setDirectStatus("connected");
      } else {
        setDirectStatus("not-detected");
      }
    } finally {
      setDetecting(false);
    }
  };

  // Auto-detect once on mount.
  useEffect(() => {
    void runDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    setHealthResult(null);
    try {
      const res = await fetch(APPEND_MESSAGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "00000000-0000-0000-0000-000000000000",
          role: "user",
          content: "health-check ping",
        }),
      });
      let bodyText = "";
      try {
        const json = await res.json();
        bodyText = JSON.stringify(json, null, 2);
      } catch {
        bodyText = await res.text();
      }
      setHealthResult({ status: res.status, body: bodyText });
    } catch (err) {
      setHealthResult({
        status: 0,
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setHealthChecking(false);
    }
  };

  const channelName = userId
    ? `matrx-extension-bridge:${userId}`
    : "(not signed in)";
  const broadcastStatus = !bridgeAuthenticated
    ? "not signed in"
    : bridgeReady
      ? "subscribed"
      : "connecting";
  const broadcastVariant: "success" | "warning" | "destructive" =
    !bridgeAuthenticated
      ? "destructive"
      : bridgeReady
        ? "success"
        : "warning";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Card 1: Direct RPC */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4 text-muted-foreground" />
            Direct RPC
            <DirectBadge status={directStatus} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!chromeAvailable && (
            <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground">
              <AlertCircle className="mr-1 inline h-3 w-3" />
              chrome.runtime API unavailable in this browser. Use a Chromium
              browser with the matrx-extend extension loaded.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ext-id" className="text-xs">
              Extension ID
            </Label>
            <select
              id="ext-id"
              value={extensionId}
              onChange={(e) => onExtensionIdChange(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              {KNOWN_EXTENSION_IDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} — {k.id.slice(0, 12)}…
                </option>
              ))}
              {customId.trim() && (
                <option value={customId.trim()}>
                  Custom — {customId.trim().slice(0, 12)}…
                </option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-id" className="text-xs">
              Custom ID (optional)
            </Label>
            <Input
              id="custom-id"
              placeholder="abcdef0123456789…"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="h-9 font-mono text-xs"
            />
          </div>
          {detectedLatencyMs != null && directStatus === "connected" && (
            <p className="text-xs text-muted-foreground">
              ping latency: {detectedLatencyMs}ms
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runDetect}
            disabled={detecting || !chromeAvailable}
            className="w-full"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`}
            />
            {detecting ? "Detecting…" : "Re-detect"}
          </Button>
        </CardContent>
      </Card>

      {/* Card 2: Supabase Broadcast */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-muted-foreground" />
            Supabase Broadcast
            <Badge variant={broadcastVariant} className="ml-auto">
              {broadcastStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-0.5">
            <Label className="text-xs">Channel</Label>
            <p className="break-all rounded-md bg-muted/60 p-2 font-mono text-xs">
              {channelName}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Last inbound:{" "}
            {bridgeLastInboundAt
              ? new Date(bridgeLastInboundAt).toLocaleTimeString()
              : "—"}
          </div>
          <p className="text-xs text-muted-foreground">
            Cross-machine RPC. Use this when your extension and this app are
            on different devices.
          </p>
        </CardContent>
      </Card>

      {/* Card 3: Append-message API */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-muted-foreground" />
            Append-message API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-0.5">
            <Label className="text-xs">Endpoint</Label>
            <p className="break-all rounded-md bg-muted/60 p-2 font-mono text-xs">
              POST {APPEND_MESSAGE_ENDPOINT}
            </p>
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auth mode</span>
              <span className="font-medium">
                {useBearerAuth ? "Bearer (AGENT_API_KEY)" : "Cookie (session)"}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {useBearerAuth ? (
                <>Token: <span className="font-mono">env AGENT_API_KEY</span></>
              ) : userEmail ? (
                <>Signed in as <span className="font-medium text-foreground">{userName ?? userEmail}</span></>
              ) : (
                <span>No active session</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Switch
                id="bearer-toggle"
                checked={useBearerAuth}
                onCheckedChange={onUseBearerAuthChange}
              />
              <Label htmlFor="bearer-toggle" className="text-xs">
                Use Bearer mode
              </Label>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runHealthCheck}
            disabled={healthChecking}
            className="w-full"
          >
            {healthChecking ? "Checking…" : "Health-check"}
          </Button>
          {healthResult && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    healthResult.status === 404
                      ? "success"
                      : healthResult.status === 401
                        ? "warning"
                        : "destructive"
                  }
                >
                  {healthResult.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {healthResult.status === 404
                    ? "route is live (404 = expected for fake conversationId)"
                    : healthResult.status === 401
                      ? "route is live (401 = need auth)"
                      : "route response"}
                </span>
              </div>
              <pre className="max-h-32 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
                {healthResult.body}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DirectBadge({ status }: { status: DirectStatus }) {
  if (status === "connected") {
    return (
      <Badge variant="success" className="ml-auto">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        connected
      </Badge>
    );
  }
  if (status === "not-detected") {
    return (
      <Badge variant="destructive" className="ml-auto">
        <XCircle className="mr-1 h-3 w-3" />
        not detected
      </Badge>
    );
  }
  if (status === "checking") {
    return (
      <Badge variant="warning" className="ml-auto">
        <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
        checking
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="ml-auto">
      unknown
    </Badge>
  );
}
