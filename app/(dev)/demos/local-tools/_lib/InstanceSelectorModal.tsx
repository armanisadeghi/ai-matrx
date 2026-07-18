"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Edit2,
  Globe,
  HardDrive,
  Laptop,
  Loader2,
  Monitor,
  RefreshCw,
  Save,
  Server,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOCAL_ENGINE_PROFILES, LOCAL_ENGINE_SCAN_LABEL } from "./constants";
import type { LocalEngineDiscovery } from "./discoverLocalEngines";
import { useAppInstances, type InstanceWithStatus } from "./useAppInstances";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

function PlatformIcon({ platform }: { platform: string | null }) {
  if (platform === "darwin")
    return <Laptop className="w-4 h-4 text-blue-500" />;
  if (platform === "windows")
    return <Monitor className="w-4 h-4 text-blue-400" />;
  if (platform === "linux")
    return <Server className="w-4 h-4 text-orange-400" />;
  return <HardDrive className="w-4 h-4 text-muted-foreground" />;
}

function StatusDot({
  status,
  latency,
}: {
  status: "idle" | "testing" | "ok" | "error";
  latency: number | null;
}) {
  if (status === "testing")
    return (
      <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-500 shrink-0" />
    );
  if (status === "ok")
    return (
      <span className="flex items-center gap-1 text-green-500 text-[10px] font-medium shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {latency != null ? `${latency}ms` : "ok"}
      </span>
    );
  if (status === "error")
    return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  return (
    <span className="w-3.5 h-3.5 rounded-full border border-border bg-muted shrink-0 inline-block" />
  );
}

// ---------------------------------------------------------------------------
// EditTunnelRow
// ---------------------------------------------------------------------------

interface EditTunnelRowProps {
  inst: InstanceWithStatus;
  onSave: (
    instanceId: string,
    tunnelUrl: string,
    tunnelWsUrl: string,
  ) => Promise<void>;
}

function EditTunnelRow({ inst, onSave }: EditTunnelRowProps) {
  const [open, setOpen] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState(inst.tunnel_url ?? "");
  const [tunnelWsUrl, setTunnelWsUrl] = useState(inst.tunnel_ws_url ?? "");
  const [saving, setSaving] = useState(false);

  // Auto-derive WS URL from HTTP URL when HTTP changes and WS is empty / derived
  const handleHttpChange = (val: string) => {
    setTunnelUrl(val);
    const derived =
      val.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws")) + "/ws";
    // Only auto-fill if ws field is empty or was previously derived
    if (!tunnelWsUrl || tunnelWsUrl === derivedWsUrl(inst.tunnel_url ?? "")) {
      setTunnelWsUrl(val ? derived : "");
    }
  };

  const derivedWsUrl = (httpUrl: string) =>
    httpUrl.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws")) + "/ws";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(inst.id, tunnelUrl.trim(), tunnelWsUrl.trim());
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent"
        title="Edit tunnel URLs"
      >
        <Edit2 className="w-3 h-3" />
        Edit tunnel
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1.5 border rounded-md p-2 bg-muted/40">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground font-medium">
          Tunnel REST URL
        </label>
        <input
          type="url"
          value={tunnelUrl}
          onChange={(e) => handleHttpChange(e.target.value)}
          placeholder="https://xxx.trycloudflare.com"
          className="h-7 text-xs font-mono rounded border px-2 bg-background w-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground font-medium">
          Tunnel WS URL
        </label>
        <input
          type="url"
          value={tunnelWsUrl}
          onChange={(e) => setTunnelWsUrl(e.target.value)}
          placeholder="wss://xxx.trycloudflare.com/ws"
          className="h-7 text-xs font-mono rounded border px-2 bg-background w-full"
        />
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          Save
        </Button>
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InstanceCard
// ---------------------------------------------------------------------------

interface InstanceCardProps {
  inst: InstanceWithStatus;
  isSelected: boolean;
  onSelect: (inst: InstanceWithStatus) => void;
  onTest: (inst: InstanceWithStatus) => void;
  onSaveTunnel: (
    instanceId: string,
    tunnelUrl: string,
    tunnelWsUrl: string,
  ) => Promise<void>;
  currentUrl: string;
  /** Localhost URL of this same machine's engine, when discovered locally. */
  localEngineUrl?: string | null;
  onUseLocal?: (url: string) => void;
}

function InstanceCard({
  inst,
  isSelected,
  onSelect,
  onTest,
  onSaveTunnel,
  currentUrl,
  localEngineUrl,
  onUseLocal,
}: InstanceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const tunnelUrl = inst.tunnel_url;
  const tunnelWsUrl = inst.tunnel_ws_url;
  const hasTunnel = !!tunnelUrl;
  const isActive = inst.is_active;

  const isCurrent = currentUrl === tunnelUrl;

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-border/70"}`}
    >
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 shrink-0">
          <PlatformIcon platform={inst.platform} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {inst.instance_name || inst.hostname || "Unnamed"}
            </span>
            {inst.hostname && inst.instance_name !== inst.hostname && (
              <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-32">
                {inst.hostname}
              </span>
            )}
            {isActive && (
              <span className="flex items-center gap-1 text-[10px] text-green-600 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                active
              </span>
            )}
            {isCurrent && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0 font-medium">
                current
              </span>
            )}
            {localEngineUrl && (
              <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded shrink-0 font-medium">
                this device — local available
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {timeAgo(inst.last_seen)}
            </span>
            {inst.platform && (
              <span className="text-[10px] text-muted-foreground capitalize">
                {inst.platform}
              </span>
            )}
            {inst.cpu_cores && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Cpu className="w-3 h-3" />
                {inst.cpu_cores}c
              </span>
            )}
            {inst.ram_total_gb && (
              <span className="text-[10px] text-muted-foreground">
                {inst.ram_total_gb.toFixed(0)}GB
              </span>
            )}
          </div>

          {/* Tunnel status row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {hasTunnel ? (
              <>
                <Wifi className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="text-[10px] font-mono text-blue-600 truncate max-w-xs">
                  {tunnelUrl}
                </span>
                {inst.tunnel_active && (
                  <span className="text-[10px] text-green-600 shrink-0">
                    active
                  </span>
                )}
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] text-muted-foreground">
                  No tunnel configured
                </span>
              </>
            )}
          </div>

          {/* Connection test results */}
          {hasTunnel && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                REST{" "}
                <StatusDot
                  status={inst.restStatus}
                  latency={inst.restLatencyMs}
                />
                {inst.restError && (
                  <span className="text-red-500">{inst.restError}</span>
                )}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                WS{" "}
                <StatusDot status={inst.wsStatus} latency={inst.wsLatencyMs} />
                {inst.wsError && (
                  <span className="text-red-500">{inst.wsError}</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasTunnel && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground"
              onClick={() => onTest(inst)}
              disabled={
                inst.restStatus === "testing" || inst.wsStatus === "testing"
              }
              title="Test connection"
            >
              {inst.restStatus === "testing" || inst.wsStatus === "testing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Test</span>
            </Button>
          )}
          {localEngineUrl && onUseLocal ? (
            // Machine is reachable on localhost — steer to the direct path;
            // routing through the tunnel from the same device is pure waste.
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs"
              onClick={() => onUseLocal(localEngineUrl)}
              title={`Connect directly via ${localEngineUrl}`}
            >
              Use local
            </Button>
          ) : (
            hasTunnel && (
              <Button
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => onSelect(inst)}
              >
                {isSelected ? "Selected" : "Use"}
              </Button>
            )
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded details + edit */}
      {expanded && (
        <div className="px-3 pb-3 border-t bg-muted/20 pt-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            {inst.instance_id && (
              <>
                <span className="text-muted-foreground">Instance ID</span>
                <span className="font-mono truncate">{inst.instance_id}</span>
              </>
            )}
            {inst.username && (
              <>
                <span className="text-muted-foreground">User</span>
                <span className="font-mono">{inst.username}</span>
              </>
            )}
            {inst.os_version && (
              <>
                <span className="text-muted-foreground">OS</span>
                <span className="font-mono truncate">{inst.os_version}</span>
              </>
            )}
            {inst.cpu_model && (
              <>
                <span className="text-muted-foreground">CPU</span>
                <span className="font-mono truncate">{inst.cpu_model}</span>
              </>
            )}
            {tunnelUrl && (
              <>
                <span className="text-muted-foreground">Tunnel REST</span>
                <span className="font-mono truncate text-blue-600">
                  {tunnelUrl}
                </span>
              </>
            )}
            {tunnelWsUrl && (
              <>
                <span className="text-muted-foreground">Tunnel WS</span>
                <span className="font-mono truncate text-blue-600">
                  {tunnelWsUrl}
                </span>
              </>
            )}
            {inst.tunnel_updated_at && (
              <>
                <span className="text-muted-foreground">Tunnel updated</span>
                <span>{timeAgo(inst.tunnel_updated_at)}</span>
              </>
            )}
          </div>

          <EditTunnelRow inst={inst} onSave={onSaveTunnel} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

interface InstanceSelectorModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl: string;
  onSelectUrl: (restUrl: string, wsUrl: string | null) => void;
  discoveredEngines?: LocalEngineDiscovery[];
  discoveringEngines?: boolean;
  onRefreshLocal?: () => void;
  onSelectLocalEngine?: (url: string) => void;
}

export function InstanceSelectorModal({
  open,
  onClose,
  currentUrl,
  onSelectUrl,
  discoveredEngines = [],
  discoveringEngines = false,
  onRefreshLocal,
  onSelectLocalEngine,
}: InstanceSelectorModalProps) {
  const {
    instances,
    loading,
    error,
    refresh,
    testInstance,
    saveTunnelUrl,
    testCustomUrl,
  } = useAppInstances();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Custom URL test section
  const [customUrl, setCustomUrl] = useState(currentUrl);
  const [customTesting, setCustomTesting] = useState(false);
  const [customResult, setCustomResult] = useState<{
    restOk: boolean;
    wsOk: boolean;
    restLatency: number | null;
    wsLatency: number | null;
    restError: string | null;
    wsError: string | null;
  } | null>(null);

  // Sync custom url with currentUrl when modal opens
  useEffect(() => {
    if (open) setCustomUrl(currentUrl);
  }, [open, currentUrl]);

  const handleTestCustom = async () => {
    if (!customUrl.trim()) return;
    setCustomTesting(true);
    setCustomResult(null);
    try {
      const result = await testCustomUrl(customUrl.trim());
      setCustomResult(result);
    } finally {
      setCustomTesting(false);
    }
  };

  const handleSelectCustom = () => {
    const wsUrl =
      customUrl.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws")) +
      "/ws";
    onSelectUrl(customUrl.trim(), wsUrl);
    onClose();
  };

  const handleSelectInstance = (inst: InstanceWithStatus) => {
    if (!inst.tunnel_url) return;
    setSelectedId(inst.id);
    onSelectUrl(inst.tunnel_url, inst.tunnel_ws_url ?? null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Select Engine Instance
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 gap-1.5 text-xs text-muted-foreground"
                onClick={refresh}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Refresh
              </Button>
              <button
                onClick={onClose}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Local engines on {LOCAL_ENGINE_SCAN_LABEL}, registered cloud
            instances, or a manual URL.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Local engine scan results */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Local Engines ({discoveredEngines.length})
              </p>
              {onRefreshLocal && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 gap-1 text-[10px] text-muted-foreground"
                  onClick={onRefreshLocal}
                  disabled={discoveringEngines}
                >
                  {discoveringEngines ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Rescan
                </Button>
              )}
            </div>

            {discoveringEngines && discoveredEngines.length === 0 && (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground justify-center border rounded-lg bg-muted/20">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Scanning {LOCAL_ENGINE_SCAN_LABEL}…
              </div>
            )}

            {!discoveringEngines && discoveredEngines.length === 0 && (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground bg-muted/10">
                No Matrx Local engine found on localhost. Start the installed
                app (22140+) or dev engine (22240+).
              </div>
            )}

            {discoveredEngines.map((engine) => {
              const profile = LOCAL_ENGINE_PROFILES[engine.profile];
              const isCurrent = currentUrl === engine.url;
              return (
                <div
                  key={engine.url}
                  className={`border rounded-lg p-3 flex items-center justify-between gap-3 transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {profile.label}
                      </span>
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                        :{engine.port}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                          current
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-green-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        online
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                      {engine.url}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      {engine.version && <span>v{engine.version}</span>}
                      {engine.availableTools.length > 0 && (
                        <span>{engine.availableTools.length} tools</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isCurrent ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs shrink-0"
                    onClick={() => {
                      onSelectLocalEngine?.(engine.url);
                      onClose();
                    }}
                  >
                    {isCurrent ? "Selected" : "Use"}
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Instances list */}
          {loading && instances.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading instances…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {instances.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Registered Instances ({instances.length})
              </p>
              {instances.map((inst) => {
                const localMatch = inst.instance_id
                  ? discoveredEngines.find(
                      (e) => e.instanceId === inst.instance_id,
                    )
                  : undefined;
                return (
                  <InstanceCard
                    key={inst.id}
                    inst={inst}
                    isSelected={selectedId === inst.id}
                    currentUrl={currentUrl}
                    onSelect={handleSelectInstance}
                    onTest={testInstance}
                    onSaveTunnel={saveTunnelUrl}
                    localEngineUrl={localMatch?.url ?? null}
                    onUseLocal={
                      onSelectLocalEngine
                        ? (url) => {
                            onSelectLocalEngine(url);
                            onClose();
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          )}

          {/* Manual URL section */}
          <div className="border rounded-lg p-3 bg-card space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Manual URL
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  setCustomResult(null);
                }}
                placeholder="http://127.0.0.1:22140, http://127.0.0.1:22240, or https://xxx.trycloudflare.com"
                className="h-8 text-xs font-mono flex-1 rounded border px-2.5 bg-background"
                onKeyDown={(e) => e.key === "Enter" && handleTestCustom()}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 gap-1.5 text-xs shrink-0"
                onClick={handleTestCustom}
                disabled={customTesting || !customUrl.trim()}
              >
                {customTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                Test
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-xs shrink-0"
                onClick={handleSelectCustom}
                disabled={!customUrl.trim()}
              >
                Use
              </Button>
            </div>

            {customResult && (
              <div className="flex items-center gap-4 text-[10px] pt-1">
                <span className="flex items-center gap-1">
                  REST{" "}
                  {customResult.restOk ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {customResult.restLatency}ms
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      {customResult.restError}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  WS{" "}
                  {customResult.wsOk ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {customResult.wsLatency}ms
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      {customResult.wsError}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
