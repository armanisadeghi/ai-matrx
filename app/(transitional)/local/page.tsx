"use client";

/**
 * /local — My Devices
 *
 * Shows all registered Matrx Local instances for the signed-in user.
 * Displays tunnel status and provides a Connect button that opens the
 * engine's public tunnel URL in a new tab (web) or connects via WebSocket.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Monitor,
  Radio,
  RefreshCw,
  ExternalLink,
  Loader2,
  Cpu,
  HardDrive,
  Globe,
  Clock,
  AlertCircle,
  WifiOff,
} from "lucide-react";
import type { LocalInstance } from "@/app/api/local-instances/route";

function formatLastSeen(lastSeen: string): string {
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function platformIcon(platform: string | null) {
  if (!platform) return "💻";
  if (platform.includes("darwin")) return "🍎";
  if (platform.includes("win")) return "🪟";
  return "🐧";
}

export default function LocalDevicesPage() {
  const [instances, setInstances] = useState<LocalInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/local-instances");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { instances: LocalInstance[] };
      setInstances(data.instances ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchInstances]);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Local Devices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Matrx Local instances registered to your account. Enable Remote Access
            in the desktop app to connect from anywhere.
          </p>
        </div>
        <button
          onClick={fetchInstances}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && instances.length === 0 && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && instances.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Monitor className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No devices registered</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Install Matrx Local on your computer, sign in with this account,
            and your device will appear here automatically.
          </p>
        </div>
      )}

      {/* Device cards */}
      <div className="space-y-4">
        {instances.map((inst) => (
          <div
            key={inst.instance_id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Card header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{platformIcon(inst.platform)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{inst.instance_name || inst.hostname || "Unknown Device"}</span>
                    {inst.is_online ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <WifiOff className="h-3 w-3" />
                        Offline
                      </span>
                    )}
                    {inst.tunnel_active && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                        <Radio className="h-3 w-3" />
                        Tunnel Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {inst.hostname}
                    {inst.os_version && ` · ${inst.os_version}`}
                  </p>
                </div>
              </div>

              {/* Connect button */}
              {inst.tunnel_active && inst.tunnel_url ? (
                <a
                  href={inst.tunnel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Connect
                </a>
              ) : (
                <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground shrink-0 cursor-not-allowed opacity-50">
                  <Globe className="h-3.5 w-3.5" />
                  No Tunnel
                </span>
              )}
            </div>

            {/* Specs grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{inst.cpu_model || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span>{inst.ram_total_gb ? `${inst.ram_total_gb} GB RAM` : "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Monitor className="h-3.5 w-3.5 shrink-0" />
                <span>{inst.architecture || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{inst.last_seen ? formatLastSeen(inst.last_seen) : "Never"}</span>
              </div>
            </div>

            {/* Tunnel URL strip */}
            {inst.tunnel_url && (
              <div className="border-t border-border/50 bg-muted/30 px-5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Tunnel URL:</span>
                <code className="flex-1 truncate text-xs font-mono text-foreground/70 mx-2">
                  {inst.tunnel_url}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(inst.tunnel_url!)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer info */}
      {instances.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {instances.filter((i) => i.is_online).length} of {instances.length} device
          {instances.length !== 1 ? "s" : ""} online ·{" "}
          {instances.filter((i) => i.tunnel_active).length} with active tunnel
        </p>
      )}
    </div>
  );
}
