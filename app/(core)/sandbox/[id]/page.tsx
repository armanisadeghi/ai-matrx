"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Square,
  Clock,
  Trash2,
  Timer,
  AlertCircle,
  Terminal,
  Send,
  Settings,
  Activity,
  HardDrive,
  Copy,
  Check,
  Shield,
  ChevronDown,
  ChevronRight,
  Zap,
  RefreshCw,
  ScrollText,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { SshAccessPanel } from "@/components/sandbox/ssh-access-panel";
import { SandboxDiagnosticsPanel } from "@/features/code/views/sandboxes/SandboxDiagnosticsPanel";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { sandboxInstanceSummary } from "@/lib/sandbox/format";
import { useTimeRemaining } from "@/hooks/sandbox/use-time-remaining";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
  getEffectiveStatus,
} from "@/lib/sandbox/status";
import type { SandboxInstance, SandboxExecResponse } from "@/types/sandbox";

const DEFAULT_CWD = "/home/agent";

interface TerminalEntry {
  type: "command" | "stdout" | "stderr" | "info";
  text: string;
  exitCode?: number;
  cwd?: string;
}

export default function SandboxDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isAdmin = useAppSelector(selectIsSuperAdmin);

  const [instance, setInstance] = useState<SandboxInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [terminalHistory, setTerminalHistory] = useState<TerminalEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remaining = useTimeRemaining(instance?.expires_at, "second");
  const [cwd, setCwd] = useState(DEFAULT_CWD);
  const [copied, setCopied] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminActionsOpen, setAdminActionsOpen] = useState(false);
  const [adminLogs, setAdminLogs] = useState<string[]>([]);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(
    null,
  );

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchInstance = useCallback(async () => {
    try {
      const resp = await fetch(`/api/sandbox/${id}`);
      if (!resp.ok) {
        if (resp.status === 404) {
          setError("Sandbox instance not found");
          return;
        }
        throw new Error("Failed to fetch sandbox");
      }
      const data = await resp.json();
      setInstance(data.instance);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInstance();
    const interval = setInterval(fetchInstance, 10000);
    return () => clearInterval(interval);
  }, [fetchInstance]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  const handleExec = async () => {
    if (!commandInput.trim() || executing) return;

    const cmd = commandInput.trim();
    setCommandInput("");
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setTerminalHistory((prev) => [
      ...prev,
      { type: "command", text: cmd, cwd },
    ]);
    setExecuting(true);

    try {
      const resp = await fetch(`/api/sandbox/${id}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeout: 60 }),
      });

      if (!resp.ok) {
        const body = await resp.json();
        setTerminalHistory((prev) => [
          ...prev,
          { type: "stderr", text: body.error || "Command failed" },
        ]);
        return;
      }

      const result: SandboxExecResponse = await resp.json();

      // Server tracks CWD — update prompt from response
      if (result.cwd) {
        setCwd(result.cwd);
      }

      if (result.stdout) {
        setTerminalHistory((prev) => [
          ...prev,
          { type: "stdout", text: result.stdout, exitCode: result.exit_code },
        ]);
      }
      if (result.stderr) {
        setTerminalHistory((prev) => [
          ...prev,
          { type: "stderr", text: result.stderr },
        ]);
      }
      // Only show exit code for non-zero failures when there was no visible output
      if (result.exit_code !== 0 && !result.stdout && !result.stderr) {
        setTerminalHistory((prev) => [
          ...prev,
          { type: "info", text: `(exit code: ${result.exit_code})` },
        ]);
      }
    } catch (err) {
      setTerminalHistory((prev) => [
        ...prev,
        {
          type: "stderr",
          text: err instanceof Error ? err.message : "Execution failed",
        },
      ]);
    } finally {
      setExecuting(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const handleCopyTerminal = useCallback(async () => {
    const text = terminalHistory
      .map((entry) => {
        switch (entry.type) {
          case "command":
            return `$ ${entry.text}`;
          case "stdout":
            return entry.text;
          case "stderr":
            return `[stderr] ${entry.text}`;
          case "info":
            return entry.text;
          default:
            return entry.text;
        }
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [terminalHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleExec();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex =
          historyIndex < commandHistory.length - 1
            ? historyIndex + 1
            : historyIndex;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommandInput("");
      }
    }
  };

  const handleStop = async () => {
    try {
      const resp = await fetch(`/api/sandbox/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setInstance(data.instance);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    }
  };

  const handleExtend = async (seconds: number) => {
    try {
      // Hit the dedicated /extend route so the orchestrator's authoritative
      // TTL is bumped and mirrored back. The legacy PUT ?action=extend path
      // was DB-only and silently drifted from the live container.
      const resp = await fetch(`/api/sandbox/${id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttl_seconds: seconds }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setInstance(data.instance);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extend");
    }
  };

  const handleDelete = async () => {
    try {
      const resp = await fetch(`/api/sandbox/${id}`, { method: "DELETE" });
      if (resp.ok || resp.status === 204) {
        router.push("/sandbox");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="h-page flex flex-col bg-textured overflow-hidden">
        <div className="shrink-0 p-4 border-b border-border bg-textured">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-8 w-16 rounded" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full rounded-md" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="h-page bg-textured flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-medium mb-2">Sandbox Not Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {error || "This sandbox does not exist."}
            </p>
            <Button onClick={() => router.push("/sandbox")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sandboxes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const effectiveStatus = getEffectiveStatus(instance);
  const isActive = ["ready", "running"].includes(effectiveStatus);
  const statusVariant = STATUS_BADGE_VARIANT[effectiveStatus] ?? "default";
  const statusLabel = STATUS_LABELS[effectiveStatus] ?? effectiveStatus;
  const initialTtlHours = Math.floor(instance.ttl_seconds / 3600);
  const initialTtlMins = Math.floor((instance.ttl_seconds % 3600) / 60);

  return (
    <div className="h-page flex flex-col bg-textured overflow-hidden">
      <div className="shrink-0 p-4 border-b border-border bg-textured">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/sandbox")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold font-mono">
                  {instance.sandbox_id}
                </h1>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Created {new Date(instance.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CopyButtons
              size="sm"
              label={`Sandbox ${instance.sandbox_id}`}
              human={() => sandboxInstanceSummary(instance)}
              agent={() => ({
                kind: "sandbox-instance",
                location: "AI Matrx — Sandbox detail",
                description:
                  "The sandbox instance currently open on the detail page.",
                data: instance,
                summary: sandboxInstanceSummary(instance),
                attributes: {
                  id: instance.id,
                  "sandbox-id": instance.sandbox_id,
                  status: effectiveStatus,
                },
              })}
            />
            {isActive && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExtend(3600)}
                >
                  <Clock className="w-4 h-4 mr-1" />
                  +1h
                </Button>
                <Button variant="outline" size="sm" onClick={handleStop}>
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && !instance && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-2 p-4">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Diagnostics dock — promoted to the top so the operator never
              has to scroll to see what's happening. Includes Reset button,
              agent filesystem, agent env (process truth), passthrough,
              live logs, and raw JSON. */}
          {isActive && (
            <Card className="border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Sandbox Inspector
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SandboxDiagnosticsPanel sandboxId={id} onReset={fetchInstance} />
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Timer className="w-4 h-4" />
                  {remaining.isExpired
                    ? "Ended"
                    : isActive
                      ? "Ends in"
                      : "Time Remaining"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-mono font-semibold">
                  {remaining.text}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Initial allotment: {initialTtlHours}h {initialTtlMins}m
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Last Heartbeat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-mono">
                  {instance.last_heartbeat_at
                    ? new Date(instance.last_heartbeat_at).toLocaleString()
                    : "No heartbeat yet"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  Storage Paths
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Hot:{" "}
                  <span className="font-mono">{instance.hot_path ?? "—"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Cold:{" "}
                  <span className="font-mono">{instance.cold_path ?? "—"}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Terminal
                </CardTitle>
                {terminalHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyTerminal}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div
                ref={terminalRef}
                className="bg-zinc-950 rounded-t-md p-4 min-h-48 max-h-[50vh] overflow-y-auto font-mono text-sm"
                onClick={() => inputRef.current?.focus()}
              >
                {terminalHistory.length === 0 && (
                  <p className="text-zinc-500">
                    {isActive
                      ? "Type a command below and press Enter..."
                      : "Sandbox is not running. Terminal is read-only."}
                  </p>
                )}
                {terminalHistory.map((entry, i) => (
                  <div key={i} className="mb-1">
                    {entry.type === "command" && (
                      <div className="text-green-400">
                        <span className="text-blue-400 text-xs">
                          {entry.cwd || ""}
                        </span>
                        <span className="text-zinc-500"> $ </span>
                        {entry.text}
                      </div>
                    )}
                    {entry.type === "stdout" && (
                      <pre className="text-zinc-200 whitespace-pre-wrap">
                        {entry.text}
                      </pre>
                    )}
                    {entry.type === "stderr" && (
                      <pre className="text-red-400 whitespace-pre-wrap">
                        {entry.text}
                      </pre>
                    )}
                    {entry.type === "info" && (
                      <div className="text-zinc-500 italic">{entry.text}</div>
                    )}
                  </div>
                ))}
                {executing && (
                  <div className="text-zinc-500 animate-pulse">
                    Executing...
                  </div>
                )}
              </div>
              <div className="flex items-center bg-zinc-900 rounded-b-md border-t border-zinc-800">
                <span className="text-green-400 font-mono text-xs pl-3 pr-0.5 shrink-0">
                  agent@sandbox
                </span>
                <span className="text-zinc-500 font-mono text-xs">:</span>
                <span
                  className="text-blue-400 font-mono text-xs pr-1 shrink-0 max-w-[200px] truncate"
                  title={cwd}
                >
                  {cwd.startsWith("/home/agent")
                    ? "~" + cwd.slice("/home/agent".length)
                    : cwd}
                </span>
                <span className="text-zinc-200 font-mono text-sm pr-1 shrink-0">
                  $
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!isActive || executing}
                  placeholder={
                    isActive ? "Enter command..." : "Sandbox not running"
                  }
                  className="flex-1 bg-transparent text-zinc-200 font-mono text-sm py-3 px-2 outline-none placeholder:text-zinc-600 disabled:opacity-50"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExec}
                  disabled={!isActive || executing || !commandInput.trim()}
                  className="mr-2 text-zinc-400 hover:text-zinc-200"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {isActive && <SshAccessPanel sandboxId={id} disabled={!isActive} />}

          {instance.config && Object.keys(instance.config).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-md p-4 text-sm font-mono overflow-x-auto">
                  {JSON.stringify(instance.config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {instance.stop_reason && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Stop reason:</span>{" "}
                  {instance.stop_reason.replace(/_/g, " ")}
                  {instance.stopped_at && (
                    <> at {new Date(instance.stopped_at).toLocaleString()}</>
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Admin Details Panel */}
          {isAdmin && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-2">
                <button
                  onClick={() => setAdminPanelOpen(!adminPanelOpen)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <Shield className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 flex-1">
                    Admin Details
                  </CardTitle>
                  {adminPanelOpen ? (
                    <ChevronDown className="w-4 h-4 text-amber-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-amber-500" />
                  )}
                </button>
              </CardHeader>
              {adminPanelOpen && (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        Instance ID
                      </span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">
                        {instance.id}
                      </code>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        Sandbox ID
                      </span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">
                        {instance.sandbox_id}
                      </code>
                    </div>
                    {instance.container_id && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                          Container ID
                        </span>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">
                          {instance.container_id}
                        </code>
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        User ID
                      </span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">
                        {instance.user_id}
                      </code>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        Hot Path
                      </span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {instance.hot_path ?? "—"}
                      </code>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        Cold Path
                      </span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {instance.cold_path ?? "—"}
                      </code>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        TTL
                      </span>
                      <span className="text-xs">
                        {instance.ttl_seconds}s (
                        {Math.floor(instance.ttl_seconds / 3600)}h{" "}
                        {Math.floor((instance.ttl_seconds % 3600) / 60)}m)
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                        Expires At
                      </span>
                      <span className="text-xs font-mono">
                        {instance.expires_at
                          ? new Date(instance.expires_at).toISOString()
                          : "--"}
                      </span>
                    </div>
                    {instance.config &&
                      Object.keys(instance.config).length > 0 && (
                        <div className="md:col-span-2">
                          <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                            Config
                          </span>
                          <pre className="text-xs font-mono bg-muted rounded p-2 overflow-x-auto">
                            {JSON.stringify(instance.config, null, 2)}
                          </pre>
                        </div>
                      )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Admin Quick-Actions Panel */}
          {isAdmin && (
            <Card className="border-rose-500/30 bg-rose-500/5">
              <CardHeader className="pb-2">
                <button
                  onClick={() => setAdminActionsOpen(!adminActionsOpen)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <Zap className="w-4 h-4 text-rose-500" />
                  <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-400 flex-1">
                    Admin Quick Actions
                  </CardTitle>
                  {adminActionsOpen ? (
                    <ChevronDown className="w-4 h-4 text-rose-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-rose-500" />
                  )}
                </button>
              </CardHeader>
              {adminActionsOpen && (
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {/* Force Stop */}
                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        disabled={!!adminActionLoading}
                        onClick={async () => {
                          setAdminActionLoading("stop");
                          try {
                            await fetch(`/api/sandbox/${id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "stop" }),
                            });
                            await fetchInstance();
                          } finally {
                            setAdminActionLoading(null);
                          }
                        }}
                      >
                        {adminActionLoading === "stop" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                        Force Stop
                      </Button>
                    )}

                    {/* View Logs (run `journalctl` or `tail /var/log/...` in the container) */}
                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!!adminActionLoading}
                        onClick={async () => {
                          setFetchingLogs(true);
                          setAdminLogs([]);
                          try {
                            const resp = await fetch(
                              `/api/sandbox/${id}/exec`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  // Read user-readable system logs only;
                                  // `dmesg` requires CAP_SYSLOG inside the
                                  // container and just produces a "Operation
                                  // not permitted" error noise line, so drop it.
                                  command:
                                    'tail -n 50 /var/log/syslog 2>/dev/null || tail -n 50 /var/log/messages 2>/dev/null || echo "No user-readable system logs on this sandbox image. For container-level docker logs, use the Matrx Ship Admin portal."',
                                  timeout: 10,
                                }),
                              },
                            );
                            const data: SandboxExecResponse = await resp.json();
                            const lines = [
                              ...(data.stdout ? data.stdout.split("\n") : []),
                              ...(data.stderr
                                ? data.stderr
                                    .split("\n")
                                    .map((l) => `[stderr] ${l}`)
                                : []),
                            ].filter(Boolean);
                            setAdminLogs(
                              lines.length > 0 ? lines : ["No output"],
                            );
                          } catch {
                            setAdminLogs(["Failed to fetch logs"]);
                          } finally {
                            setFetchingLogs(false);
                          }
                        }}
                      >
                        {fetchingLogs ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ScrollText className="w-3.5 h-3.5" />
                        )}
                        View Logs
                      </Button>
                    )}

                    {/* Direct API Inspect */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        window.open(`/api/sandbox/${id}`, "_blank");
                      }}
                    >
                      <Network className="w-3.5 h-3.5" />
                      API Inspect
                    </Button>

                    {/* Extend TTL for admin debugging */}
                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!!adminActionLoading}
                        onClick={async () => {
                          setAdminActionLoading("extend");
                          try {
                            // Use the dedicated /extend route — the legacy
                            // PUT ?action=extend was DB-only AND we were
                            // sending `seconds` instead of `ttl_seconds`,
                            // so the orchestrator never saw the bump and the
                            // mirrored expires_at silently drifted.
                            await fetch(`/api/sandbox/${id}/extend`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ttl_seconds: 3600 }),
                            });
                            await fetchInstance();
                          } finally {
                            setAdminActionLoading(null);
                          }
                        }}
                      >
                        {adminActionLoading === "extend" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        +1h Debug Time
                      </Button>
                    )}
                  </div>

                  {/* Logs output */}
                  {adminLogs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Container Logs
                      </p>
                      <pre className="text-[10px] font-mono bg-black/80 text-green-400 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto">
                        {adminLogs.join("\n")}
                      </pre>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Admin actions bypass user permissions. Use responsibly.
                  </p>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-card px-4 py-2">
        <div className="flex items-center justify-between gap-4 max-w-6xl mx-auto text-xs text-muted-foreground">
          <span className="font-mono truncate">{instance.sandbox_id}</span>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            {!remaining.isExpired && (
              <span className="font-mono">
                {isActive ? "Ends in " : ""}
                {remaining.text}
              </span>
            )}
          </div>
        </div>
      </footer>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              This is a destructive action.
              {isActive ? " The running container will be destroyed and " : " "}
              the sandbox row will be removed from your list.{" "}
              <strong>
                Your /home/agent volume on this tier is not deleted
              </strong>{" "}
              — it stays put and will be re-mounted on the next sandbox you
              create. To wipe persistent storage entirely, use Settings →
              Sandbox Storage. If you just want to stop this container, use Stop
              instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Sandbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
