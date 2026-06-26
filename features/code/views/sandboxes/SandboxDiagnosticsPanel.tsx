"use client";

/**
 * SandboxDiagnosticsPanel
 *
 * Total visibility into the sandbox's state. Three sections:
 *
 *   1. Readiness check — every layer reported with status code + latency:
 *        container ≫ matrx_agent (port 8000) ≫ aidream /api/health (8001)
 *        ≫ aidream /api/health/ready (8001 — exercises DB pools).
 *      Polls every 2s during boot, every 30s after `overall_ok=true`.
 *
 *   2. Env passthrough — names of every env var that landed inside the
 *      container (validates that critical vars like
 *      SUPABASE_AUTOMATION_MATRIX_DB_PASSWORD propagated). Names only —
 *      values never leave the orchestrator.
 *
 *   3. Live logs — text stream from inside the sandbox. User picks the
 *      source (docker / aidream / matrx_agent / entrypoint / autostart /
 *      all) and tail count; refreshes on a 3s timer plus a manual refresh
 *      button. Renders in a monospace block with line numbers.
 *
 * Used by:
 *   - The create-sandbox flow (CreateSandboxModal): stays open until the
 *     diagnostics report ``overall_ok: true``, then auto-closes (or shows
 *     a "looks good — connect now" CTA depending on ux).
 *   - The sandbox detail page: always-visible bottom panel so the user
 *     can see exactly what's happening at any time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Activity,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  MinusCircle,
  File as FileIcon,
  Folder as FolderIcon,
  FolderOpen,
} from "lucide-react";

type DiagCheck = {
  ok?: boolean;
  status?: number;
  latency_ms?: number;
  body_preview?: string | null;
  error?: string;
  checked: boolean;
  reason?: string;
};

export type SandboxDiagnostics = {
  sandbox_id: string;
  overall_ok: boolean;
  sandbox: {
    status: string;
    tier: string;
    template: string | null;
    template_version: string | null;
    user_id: string;
    container_id: string | null;
    proxy_url: string | null;
    ssh_port: number | null;
    expires_at: string | null;
    last_heartbeat_at: string | null;
    persistence_volume: string | null;
    hot_path: string;
    cold_path: string;
  };
  container: {
    present: boolean;
    running?: boolean;
    status?: string;
    health?: string;
    started_at?: string;
    container_ip?: string;
    image?: string;
    passthrough_landed?: string[];
    passthrough_missing_count?: number;
    passthrough_missing_sample?: string[];
    error?: string;
  };
  checks: {
    matrx_agent_8000: DiagCheck;
    aidream_health_8001: DiagCheck;
    aidream_ready_8001: DiagCheck;
  };
  /** Stamped by the orchestrator at create-time so the UI shows exactly
   *  why secrets did or didn't land. Empty object {} when the sandbox was
   *  created before this field was introduced. */
  secrets_injection?: {
    attempted?: boolean;
    skipped_reason?: string | null;
    fetched_count?: number;
    fetched_at?: string | null;
    status_code?: number | null;
    error?: string | null;
    aidream_url_set?: boolean;
    aidream_service_token_set?: boolean;
    user_id_set?: boolean;
  };
};

const LOG_SOURCES = [
  "all",
  "aidream",
  "matrx_agent",
  "entrypoint",
  "autostart",
  "docker",
] as const;
type LogSource = (typeof LOG_SOURCES)[number];

/**
 * Which sections of the diagnostics panel render.
 *
 * - `"all"` (default) — original behaviour: status header + every internal
 *   tab (filesystem / agent-env / passthrough / logs / raw).
 * - `"status"` — status header only (readiness checks, container, env count).
 *   Used when the bottom panel decomposes diagnostics into separate tabs and
 *   the user has dedicated tabs for files / env.
 * - `"filesystem"` — only the agent filesystem browser, no status header.
 * - `"env"` — only the agent-env + passthrough tabs, no status header.
 */
export type SandboxDiagnosticsView = "all" | "status" | "filesystem" | "env";

interface Props {
  /** Sandbox row UUID (NOT the sbx-XXX short id). */
  sandboxId: string;
  /** Show / hide the bottom log block. Defaults true. */
  showLogs?: boolean;
  /** Polling interval in seconds while the sandbox isn't yet healthy. */
  unhealthyPollSeconds?: number;
  /** Polling interval after overall_ok=true. */
  healthyPollSeconds?: number;
  /** Notify parent when overall_ok flips True. The create-sandbox flow uses
   *  this to flip "creating" → "ready" without polling Supabase. */
  onReady?: (diag: SandboxDiagnostics) => void;
  /** Show the Reset button in the header. Defaults true. The create-sandbox
   *  flow can hide it (you can't reset a sandbox that hasn't booted yet). */
  showResetButton?: boolean;
  /** Callback fired after a successful reset finishes. The detail page uses
   *  this to refresh its row state and re-fire the readiness gate. */
  onReset?: () => void;
  /**
   * Render only a subset of sections — used by the /code bottom panel to
   * give each diagnostic surface its own tab instead of nesting tabs inside
   * an "Inspector" mega-tab.
   */
  view?: SandboxDiagnosticsView;
}

// ── Agent filesystem types (matches matrx_agent /fs/list response) ──────────
// Each entry is a stat dict: { name, path, kind: "file"|"dir"|"symlink", size, mtime, mode, target }
interface FsEntry {
  path: string;
  name: string;
  kind?: "file" | "dir" | "symlink";
  is_dir?: boolean; // back-compat in case the daemon ever shifts back
  size?: number;
  mtime?: number;
}

interface FsNode {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error?: string;
  children: FsNode[];
}

interface AgentEnvKv {
  key: string;
  value: string;
}

interface AgentEnvResponse {
  sandbox_id: string;
  container_config_env?: AgentEnvKv[];
  runtime_env?: AgentEnvKv[];
  runtime_env_error?: string;
  aidream_proc_env?: AgentEnvKv[];
  aidream_proc_env_error?: string;
  aidream_pid?: number;
}

export function SandboxDiagnosticsPanel({
  sandboxId,
  showLogs = true,
  unhealthyPollSeconds = 2,
  healthyPollSeconds = 30,
  onReady,
  showResetButton = true,
  onReset,
  view = "all",
}: Props) {
  // Section gates — derived from `view`. Keep these as plain booleans so the
  // JSX below stays readable.
  const showStatus = view === "all" || view === "status";
  const showFilesystem = view === "all" || view === "filesystem";
  const showEnv = view === "all" || view === "env";
  const showRaw = view === "all";
  const showInternalTabs = showFilesystem || showEnv || showRaw || showLogs;
  const initialTabValue: "filesystem" | "agent-env" | "env" | "raw" =
    showFilesystem ? "filesystem" : showEnv ? "agent-env" : "raw";
  const [diag, setDiag] = useState<SandboxDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [logSource, setLogSource] = useState<LogSource>("aidream");
  const [logTail, setLogTail] = useState<number>(200);
  const [logsLoading, setLogsLoading] = useState(false);
  const onReadyFiredRef = useRef(false);

  // ── Reset state ──────────────────────────────────────────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWipe, setResetWipe] = useState(false);
  const [resetting, setResetting] = useState(false);

  // ── Filesystem tree state (lazy-loaded) ──────────────────────────────────
  const [fsRootPath, setFsRootPath] = useState<string>("/home/agent");
  const [fsRoot, setFsRoot] = useState<FsNode | null>(null);
  const [fsRootLoading, setFsRootLoading] = useState(false);
  const [fsRootError, setFsRootError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBinary, setFileBinary] = useState(false);

  // ── Agent env state ──────────────────────────────────────────────────────
  const [agentEnv, setAgentEnv] = useState<AgentEnvResponse | null>(null);
  const [agentEnvLoading, setAgentEnvLoading] = useState(false);
  const [agentEnvError, setAgentEnvError] = useState<string | null>(null);
  const [envFilter, setEnvFilter] = useState("");
  const [envView, setEnvView] = useState<
    "container_config_env" | "runtime_env" | "aidream_proc_env"
  >("aidream_proc_env");

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/sandbox/${sandboxId}/diagnostics`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 300)}`);
      }
      const json = (await r.json()) as SandboxDiagnostics;
      setDiag(json);
      if (json.overall_ok && !onReadyFiredRef.current && onReady) {
        onReadyFiredRef.current = true;
        onReady(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sandboxId, onReady]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const r = await fetch(
        `/api/sandbox/${sandboxId}/logs?source=${logSource}&tail=${logTail}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        setLogs(`(could not fetch logs: HTTP ${r.status})\n${await r.text()}`);
      } else {
        setLogs(await r.text());
      }
    } catch (e) {
      setLogs(
        `(error fetching logs: ${e instanceof Error ? e.message : String(e)})`,
      );
    } finally {
      setLogsLoading(false);
    }
  }, [sandboxId, logSource, logTail]);

  // ── Reset handler ────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    setResetting(true);
    try {
      const r = await fetch(`/api/sandbox/${sandboxId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wipe_volume: resetWipe }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 300)}`);
      }
      const json = await r.json();
      toast.success(
        resetWipe
          ? "Sandbox reset (volume wiped) — new container booting"
          : "Sandbox reset — new container booting (volume preserved)",
      );
      // Reset readiness gate so onReady fires again on the new sandbox.
      onReadyFiredRef.current = false;
      setDiag(null);
      setFsRoot(null);
      setSelectedFile(null);
      setFileContent("");
      setAgentEnv(null);
      onReset?.();
      setResetOpen(false);
      // Kick a fresh diagnostic poll right away
      void fetchDiagnostics();
      return json;
    } catch (e) {
      toast.error(
        `Reset failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setResetting(false);
    }
  }, [sandboxId, resetWipe, onReset, fetchDiagnostics]);

  // ── Filesystem tree loaders ──────────────────────────────────────────────
  const loadDir = useCallback(
    async (path: string): Promise<FsNode[]> => {
      const r = await fetch(
        `/api/sandbox/${sandboxId}/fs/list?path=${encodeURIComponent(path)}&depth=1`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
      }
      const json = (await r.json()) as { entries: FsEntry[] };
      const entries = (json.entries || [])
        .map((e) => ({
          path: e.path,
          name: e.name || e.path.split("/").pop() || e.path,
          isDir: e.kind === "dir" || e.is_dir === true,
          size: e.size,
          expanded: false,
          loaded: false,
          loading: false,
          children: [] as FsNode[],
        }))
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return entries;
    },
    [sandboxId],
  );

  const fetchFsRoot = useCallback(async () => {
    setFsRootLoading(true);
    setFsRootError(null);
    try {
      const children = await loadDir(fsRootPath);
      setFsRoot({
        path: fsRootPath,
        name: fsRootPath,
        isDir: true,
        expanded: true,
        loaded: true,
        loading: false,
        children,
      });
    } catch (e) {
      setFsRootError(e instanceof Error ? e.message : String(e));
      setFsRoot(null);
    } finally {
      setFsRootLoading(false);
    }
  }, [fsRootPath, loadDir]);

  const toggleNode = useCallback(
    async (target: FsNode) => {
      if (!fsRoot) return;
      // Mutate immutably by walking the tree and rebuilding the path.
      const updateNode = (node: FsNode): FsNode => {
        if (node.path === target.path) {
          if (node.expanded) {
            return { ...node, expanded: false };
          }
          if (node.loaded) {
            return { ...node, expanded: true };
          }
          // Need to lazy-load
          return { ...node, expanded: true, loading: true };
        }
        if (node.children.length) {
          return { ...node, children: node.children.map(updateNode) };
        }
        return node;
      };
      setFsRoot((prev) => (prev ? updateNode(prev) : prev));

      if (!target.loaded && !target.expanded) {
        try {
          const children = await loadDir(target.path);
          setFsRoot((prev) => {
            if (!prev) return prev;
            const apply = (node: FsNode): FsNode => {
              if (node.path === target.path) {
                return { ...node, children, loaded: true, loading: false };
              }
              if (node.children.length) {
                return { ...node, children: node.children.map(apply) };
              }
              return node;
            };
            return apply(prev);
          });
        } catch (e) {
          setFsRoot((prev) => {
            if (!prev) return prev;
            const apply = (node: FsNode): FsNode => {
              if (node.path === target.path) {
                return {
                  ...node,
                  loading: false,
                  error: e instanceof Error ? e.message : String(e),
                };
              }
              if (node.children.length) {
                return { ...node, children: node.children.map(apply) };
              }
              return node;
            };
            return apply(prev);
          });
        }
      }
    },
    [fsRoot, loadDir],
  );

  const fetchFileContent = useCallback(
    async (path: string) => {
      setFileLoading(true);
      setFileError(null);
      setFileContent("");
      setFileBinary(false);
      try {
        const r = await fetch(
          `/api/sandbox/${sandboxId}/fs/read?path=${encodeURIComponent(path)}`,
          { cache: "no-store" },
        );
        if (r.status === 400) {
          // Likely binary — try base64 next
          setFileBinary(true);
          const r2 = await fetch(
            `/api/sandbox/${sandboxId}/fs/read?path=${encodeURIComponent(path)}&encoding=base64`,
            { cache: "no-store" },
          );
          if (!r2.ok) {
            const t = await r2.text();
            throw new Error(`HTTP ${r2.status}: ${t.slice(0, 200)}`);
          }
          const b64 = await r2.text();
          setFileContent(
            `(binary, base64 — ${b64.length} chars)\n${b64.slice(0, 4000)}${b64.length > 4000 ? "…" : ""}`,
          );
          return;
        }
        if (!r.ok) {
          const body = await r.text();
          throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
        }
        setFileContent(await r.text());
      } catch (e) {
        setFileError(e instanceof Error ? e.message : String(e));
      } finally {
        setFileLoading(false);
      }
    },
    [sandboxId],
  );

  // ── Agent env loader ─────────────────────────────────────────────────────
  const fetchAgentEnv = useCallback(async () => {
    setAgentEnvLoading(true);
    setAgentEnvError(null);
    try {
      const r = await fetch(`/api/sandbox/${sandboxId}/agent-env`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 300)}`);
      }
      const json = (await r.json()) as AgentEnvResponse;
      setAgentEnv(json);
    } catch (e) {
      setAgentEnvError(e instanceof Error ? e.message : String(e));
    } finally {
      setAgentEnvLoading(false);
    }
  }, [sandboxId]);

  // Poll diagnostics
  useEffect(() => {
    if (!sandboxId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchDiagnostics();
    };
    tick();
    const interval = setInterval(
      tick,
      (diag?.overall_ok ? healthyPollSeconds : unhealthyPollSeconds) * 1000,
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    sandboxId,
    diag?.overall_ok,
    fetchDiagnostics,
    healthyPollSeconds,
    unhealthyPollSeconds,
  ]);

  // Poll logs
  useEffect(() => {
    if (!sandboxId || !showLogs) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchLogs();
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sandboxId, showLogs, fetchLogs, logSource, logTail]);

  if (error && !diag) {
    return (
      <div className="border border-destructive rounded-md p-3 text-sm">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <AlertCircle className="h-4 w-4" />
          Diagnostics failed
        </div>
        <pre className="mt-2 text-xs whitespace-pre-wrap font-mono opacity-80">
          {error}
        </pre>
      </div>
    );
  }

  if (!diag) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Running diagnostics…
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {showStatus && (
        <>
          {/* Top status bar */}
          <div className="flex items-center justify-between border-b border-border pb-2 gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {diag.overall_ok ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
                >
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                >
                  <Activity className="h-3 w-3 animate-pulse" /> Booting
                </Badge>
              )}
              <span className="text-xs text-muted-foreground font-mono">
                {diag.sandbox_id}
              </span>
              {(diag.sandbox.template || diag.sandbox.tier) && (
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  <span className="font-mono">
                    {diag.sandbox.template ?? "default"}
                  </span>{" "}
                  on{" "}
                  <span className="font-mono uppercase">
                    {diag.sandbox.tier}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showResetButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetOpen(true)}
                  disabled={resetting}
                  title="Destroy + recreate this sandbox with the latest image. Per-user volume preserved by default."
                >
                  <RotateCcw
                    className={`h-3 w-3 mr-1 ${resetting ? "animate-spin" : ""}`}
                  />
                  Reset
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDiagnostics}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>

          {/* Layer-by-layer checks — every card honors the orchestrator's
              `checked` flag. A check the orchestrator skipped for this
              template (e.g. aidream on a non-aidream image) renders as a
              neutral "Not applicable" card, never as a red failure. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <CheckCard
              label="Container"
              {...formatContainerCheck(diag.container)}
            />
            <CheckCard
              label="Matrx agent · :8000"
              {...formatCheck(diag.checks.matrx_agent_8000)}
            />
            <CheckCard
              label="AI Dream health · :8001"
              {...formatCheck(diag.checks.aidream_health_8001)}
            />
            <CheckCard
              label="AI Dream ready · :8001"
              {...formatCheck(diag.checks.aidream_ready_8001)}
              colSpan="md:col-span-2"
            />
            <CheckCard
              label="Env passthrough"
              {...formatPassthroughCheck(diag.container)}
            />
          </div>
        </>
      )}

      {showInternalTabs && (
        <Tabs
          defaultValue={initialTabValue}
          className="w-full"
          onValueChange={(v) => {
            // Lazy-load each tab on first activation
            if (v === "filesystem" && !fsRoot && !fsRootLoading)
              void fetchFsRoot();
            if (v === "agent-env" && !agentEnv && !agentEnvLoading)
              void fetchAgentEnv();
          }}
        >
          <TabsList>
            {showFilesystem && (
              <TabsTrigger value="filesystem">Agent filesystem</TabsTrigger>
            )}
            {showEnv && <TabsTrigger value="agent-env">Agent env</TabsTrigger>}
            {showEnv && <TabsTrigger value="env">Passthrough</TabsTrigger>}
            {showEnv && (
              <TabsTrigger value="secrets">Secrets injection</TabsTrigger>
            )}
            {showLogs && <TabsTrigger value="logs">Live logs</TabsTrigger>}
            {showRaw && <TabsTrigger value="raw">Raw response</TabsTrigger>}
          </TabsList>

          {showFilesystem && (
            <TabsContent
              value="filesystem"
              className="mt-2 md:h-[30rem] md:flex md:flex-col"
            >
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <Input
                  value={fsRootPath}
                  onChange={(e) => setFsRootPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void fetchFsRoot();
                  }}
                  className="text-xs h-8 font-mono max-w-md"
                  placeholder="/home/agent"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchFsRoot}
                  disabled={fsRootLoading}
                >
                  <RefreshCw
                    className={`h-3 w-3 mr-1 ${fsRootLoading ? "animate-spin" : ""}`}
                  />
                  Load
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Lists what the agent sees via the same <code>/fs/list</code>{" "}
                  endpoint <code>fs_list</code> uses.
                </span>
              </div>
              {fsRootError && (
                <div className="text-destructive text-xs font-mono mb-2 break-all shrink-0">
                  {fsRootError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:flex-1 md:min-h-0">
                <ScrollArea className="h-72 md:h-full border border-border rounded-md">
                  <div className="p-2 text-xs font-mono">
                    {fsRootLoading && !fsRoot ? (
                      <div className="text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                      </div>
                    ) : fsRoot ? (
                      <FsTree
                        node={fsRoot}
                        onToggle={toggleNode}
                        onSelectFile={(p, n) => {
                          setSelectedFile({ path: p, name: n });
                          void fetchFileContent(p);
                        }}
                        selectedPath={selectedFile?.path}
                      />
                    ) : (
                      <div className="text-muted-foreground">
                        (no tree loaded)
                      </div>
                    )}
                  </div>
                </ScrollArea>
                <ScrollArea className="h-72 md:h-full border border-border rounded-md">
                  <div className="p-2 text-xs">
                    {selectedFile ? (
                      <>
                        <div className="font-mono text-muted-foreground border-b border-border pb-1 mb-2 flex items-center justify-between gap-2 break-all">
                          <span>{selectedFile.path}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void fetchFileContent(selectedFile.path)
                            }
                            disabled={fileLoading}
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${fileLoading ? "animate-spin" : ""}`}
                            />
                          </Button>
                        </div>
                        {fileLoading ? (
                          <div className="text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />{" "}
                            Reading…
                          </div>
                        ) : fileError ? (
                          <pre className="text-destructive whitespace-pre-wrap font-mono">
                            {fileError}
                          </pre>
                        ) : (
                          <pre className="font-mono whitespace-pre-wrap leading-tight">
                            {fileContent || "(empty file)"}
                          </pre>
                        )}
                      </>
                    ) : (
                      <div className="text-muted-foreground">
                        Click a file in the tree to read it.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          )}

          {showEnv && (
            <TabsContent
              value="agent-env"
              className="mt-2 md:h-[30rem] md:flex md:flex-col"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
                <select
                  value={envView}
                  onChange={(e) => setEnvView(e.target.value as typeof envView)}
                  className="text-xs border border-border rounded-md px-2 py-1 bg-background"
                >
                  <option value="aidream_proc_env">
                    aidream process env (truth)
                  </option>
                  <option value="runtime_env">shell env (runtime)</option>
                  <option value="container_config_env">
                    docker Config.Env (creation)
                  </option>
                </select>
                <Input
                  value={envFilter}
                  onChange={(e) => setEnvFilter(e.target.value)}
                  className="text-xs h-8 font-mono max-w-xs"
                  placeholder="filter by key…"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAgentEnv}
                  disabled={agentEnvLoading}
                >
                  <RefreshCw
                    className={`h-3 w-3 mr-1 ${agentEnvLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
                {agentEnv?.aidream_pid && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    aidream pid={agentEnv.aidream_pid}
                  </span>
                )}
              </div>
              {agentEnvError && (
                <div className="text-destructive text-xs font-mono mb-2 break-all shrink-0">
                  {agentEnvError}
                </div>
              )}
              {agentEnv?.[`${envView}_error` as keyof AgentEnvResponse] && (
                <div className="text-destructive text-xs font-mono mb-2 break-all shrink-0">
                  {String(
                    agentEnv[`${envView}_error` as keyof AgentEnvResponse],
                  )}
                </div>
              )}
              <ScrollArea className="h-96 md:h-auto md:flex-1 md:min-h-0 border border-border rounded-md">
                <table className="w-full text-[11px] font-mono">
                  <thead className="text-left text-muted-foreground sticky top-0 bg-background">
                    <tr>
                      <th className="p-2 w-1/3">key</th>
                      <th className="p-2">value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const list: AgentEnvKv[] =
                        (agentEnv?.[envView] as AgentEnvKv[]) || [];
                      const filtered = envFilter
                        ? list.filter(
                            (kv) =>
                              kv.key
                                .toLowerCase()
                                .includes(envFilter.toLowerCase()) ||
                              kv.value
                                .toLowerCase()
                                .includes(envFilter.toLowerCase()),
                          )
                        : list;
                      if (!filtered.length) {
                        return (
                          <tr>
                            <td
                              colSpan={2}
                              className="p-2 text-muted-foreground"
                            >
                              {agentEnvLoading ? "Loading…" : "(no entries)"}
                            </td>
                          </tr>
                        );
                      }
                      return filtered.map((kv) => (
                        <tr
                          key={kv.key}
                          className="border-t border-border align-top"
                        >
                          <td className="p-2 break-all">{kv.key}</td>
                          <td className="p-2 break-all">{kv.value}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </ScrollArea>
              <p className="text-[11px] text-muted-foreground mt-2 shrink-0">
                <strong>aidream process env</strong> is the ground truth —
                it&apos;s what the FastAPI process actually sees. If a var is
                here, the agent has it. If not, no amount of{" "}
                <code>env_file</code> tweaking matters until you find why it
                didn&apos;t propagate.
              </p>
            </TabsContent>
          )}

          {showRaw && (
            <TabsContent
              value="raw"
              className="mt-2 md:h-[30rem] md:flex md:flex-col min-h-[18rem]"
            >
              <JsonInspector
                data={diag}
                defaultView="json"
                className="h-full min-h-[18rem] rounded-md border border-border shadow-none"
              />
            </TabsContent>
          )}

          {showEnv && (
            <TabsContent
              value="env"
              className="mt-2 md:h-[30rem] md:flex md:flex-col"
            >
              <div className="text-xs space-y-2 md:flex md:flex-col md:flex-1 md:min-h-0">
                <div className="shrink-0">
                  <strong>
                    {diag.container.passthrough_landed?.length ?? 0}
                  </strong>{" "}
                  env vars landed inside the container:
                </div>
                <ScrollArea className="h-60 md:h-auto md:flex-1 md:min-h-0 border border-border rounded-md">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 p-2 font-mono">
                    {(diag.container.passthrough_landed ?? []).map((k) => (
                      <span key={k} className="text-success">
                        ✓ {k}
                      </span>
                    ))}
                    {(diag.container.passthrough_missing_sample ?? []).map(
                      (k) => (
                        <span key={k} className="text-muted-foreground">
                          — {k}
                        </span>
                      ),
                    )}
                  </div>
                </ScrollArea>
                {(diag.container.passthrough_missing_count ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground shrink-0">
                    {diag.container.passthrough_missing_count} more not set on
                    the orchestrator (see{" "}
                    <code className="text-xs">missing_keys</code> in the
                    orchestrator's <code>/integrations</code>).
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {showEnv && (
            <TabsContent
              value="secrets"
              className="mt-2 md:h-[30rem] md:flex md:flex-col"
            >
              <SecretsInjectionPanel diag={diag} />
            </TabsContent>
          )}

          {showLogs && (
            <TabsContent
              value="logs"
              className="mt-2 md:h-[30rem] md:flex md:flex-col"
            >
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <select
                  value={logSource}
                  onChange={(e) => setLogSource(e.target.value as LogSource)}
                  className="text-xs border border-border rounded-md px-2 py-1 bg-background"
                >
                  {LOG_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={logTail}
                  onChange={(e) => setLogTail(Number(e.target.value))}
                  className="text-xs border border-border rounded-md px-2 py-1 bg-background"
                >
                  {[100, 200, 500, 1000, 2000].map((n) => (
                    <option key={n} value={n}>
                      tail {n}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchLogs}
                  disabled={logsLoading}
                >
                  <RefreshCw
                    className={`h-3 w-3 mr-1 ${logsLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
                <span className="text-xs text-muted-foreground">
                  auto-refreshes every 3s
                </span>
              </div>
              <ScrollArea className="h-96 md:h-auto md:flex-1 md:min-h-0 border border-border rounded-md">
                <pre className="text-[11px] font-mono p-3 whitespace-pre-wrap leading-tight">
                  {logs || "(empty)"}
                </pre>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!resetting) setResetOpen(open);
        }}
        title="Reset sandbox"
        description={
          <div className="space-y-2 text-sm">
            <p>
              Destroys the running container and re-creates it with the same
              template / tier / resources, picking up any latest image or config
              changes.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={resetWipe}
                onCheckedChange={(v) => setResetWipe(v === true)}
                className="mt-0.5 h-3 w-3 shrink-0"
              />
              <span>
                Also wipe persistent volume (<code>/home/agent</code>) —
                destructive, user data is lost.
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Without the wipe, your home dir, git checkouts, and any installed
              packages survive. With the wipe, you start clean.
            </p>
          </div>
        }
        confirmLabel={
          resetWipe ? "Reset and wipe volume" : "Reset (preserve volume)"
        }
        variant={resetWipe ? "destructive" : "default"}
        busy={resetting}
        onConfirm={handleReset}
      />
    </div>
  );
}

function FsTree({
  node,
  onToggle,
  onSelectFile,
  selectedPath,
  depth = 0,
}: {
  node: FsNode;
  onToggle: (n: FsNode) => void;
  onSelectFile: (path: string, name: string) => void;
  selectedPath?: string;
  depth?: number;
}) {
  const indent = { paddingLeft: `${depth * 12}px` };
  const isSelected = selectedPath === node.path;
  return (
    <div>
      <div
        className={`flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 ${isSelected ? "bg-muted" : ""}`}
        style={indent}
        onClick={() => {
          if (node.isDir) onToggle(node);
          else onSelectFile(node.path, node.name);
        }}
      >
        {node.isDir ? (
          node.expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3" />
        )}
        {node.isDir ? (
          node.expanded ? (
            <FolderOpen className="h-3 w-3 shrink-0 text-blue-500" />
          ) : (
            <FolderIcon className="h-3 w-3 shrink-0 text-blue-500" />
          )
        ) : (
          <FileIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="break-all">{node.name}</span>
        {node.loading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {node.error && (
          <span className="text-destructive text-[10px]" title={node.error}>
            (error)
          </span>
        )}
        {!node.isDir && typeof node.size === "number" && (
          <span className="text-[10px] text-muted-foreground ml-auto pr-1">
            {formatBytes(node.size)}
          </span>
        )}
      </div>
      {node.isDir &&
        node.expanded &&
        node.children.map((c) => (
          <FsTree
            key={c.path}
            node={c}
            onToggle={onToggle}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Tri-state status for a single readiness card. */
type CheckState = "ok" | "fail" | "na";

interface CheckCardData {
  state: CheckState;
  detail: string;
}

/**
 * Map an orchestrator `DiagCheck` to a tri-state card.
 *
 * The orchestrator sets `checked: false` when a probe is intentionally skipped
 * for the current template/tier (e.g. the `aidream` health probe on a
 * minimal-shell template that doesn't ship the AI Dream service). The previous
 * version of this UI mapped `checked: false` → `ok: false` → red X, which
 * flagged every non-AI template as "broken" out of the box. We honor the
 * server's intent instead and render those as a neutral "Not applicable" card.
 */
function formatCheck(c: DiagCheck): CheckCardData {
  if (!c.checked) {
    return {
      state: "na",
      detail: c.reason ?? "not applicable for this template",
    };
  }
  if (c.error) {
    return {
      state: "fail",
      detail: `${c.error} · ${c.latency_ms ?? "?"}ms`,
    };
  }
  return {
    state: c.ok ? "ok" : "fail",
    detail: `HTTP ${c.status ?? "?"} · ${c.latency_ms ?? "?"}ms`,
  };
}

function formatContainerCheck(
  container: SandboxDiagnostics["container"],
): CheckCardData {
  if (!container.present) {
    return { state: "fail", detail: container.error ?? "container missing" };
  }
  return {
    state: container.running ? "ok" : "fail",
    detail: `${container.status ?? "?"} · ${container.health ?? "?"} · ip ${container.container_ip ?? "?"}`,
  };
}

/**
 * Env passthrough check. Previously hard-coded `> 50` as the success threshold,
 * which had nothing to do with what the current template actually needs — a
 * minimal-shell template might only need 5 vars; aidream templates need ~60.
 *
 * We don't have a per-template manifest of "required" vars on the client, so
 * we treat passthrough as informational by default: any landed vars at all
 * counts as healthy, and we only flag a failure when the container truly
 * inherited zero env (which always means the entrypoint is broken).
 */
function formatPassthroughCheck(
  container: SandboxDiagnostics["container"],
): CheckCardData {
  const landed = container.passthrough_landed?.length ?? 0;
  const missing = container.passthrough_missing_count ?? 0;
  if (!container.passthrough_landed) {
    return { state: "na", detail: "no data reported" };
  }
  if (landed === 0) {
    return { state: "fail", detail: "no env landed in container" };
  }
  return {
    state: "ok",
    detail: `${landed} landed · ${missing} missing`,
  };
}

function CheckCard({
  label,
  state,
  detail,
  colSpan,
}: {
  label: string;
  state: CheckState;
  detail: string;
  colSpan?: string;
}) {
  const Icon =
    state === "ok" ? CheckCircle2 : state === "fail" ? XCircle : MinusCircle;
  const iconClass =
    state === "ok"
      ? "text-green-600 dark:text-green-400"
      : state === "fail"
        ? "text-destructive"
        : "text-muted-foreground/60";
  const ring =
    state === "fail"
      ? "border-destructive/40 bg-destructive/5"
      : state === "na"
        ? "border-dashed border-border/60 bg-muted/30"
        : "border-border";
  return (
    <div className={`border rounded-md p-2 ${ring} ${colSpan ?? ""}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
        <span
          className={`text-xs font-medium ${state === "na" ? "text-muted-foreground" : ""}`}
        >
          {label}
        </span>
        {state === "na" && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
            N/A
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 font-mono break-all">
        {detail}
      </div>
    </div>
  );
}

// ── Secrets-injection panel ───────────────────────────────────────────────
// Reads `diag.secrets_injection` (stamped by the orchestrator at create-
// time onto sandbox_instances.config.secrets_injection) and renders a
// clear status surface — no more "0 env vars landed" with no explanation
// of WHY.

function SecretsInjectionPanel({ diag }: { diag: SandboxDiagnostics }) {
  const si = diag.secrets_injection;
  const headline = headlineFor(si);

  return (
    <div className="text-xs space-y-3 md:flex md:flex-col md:flex-1 md:min-h-0">
      <div className="shrink-0 flex items-center gap-2">
        <Badge
          variant={
            headline.tone === "success"
              ? "default"
              : headline.tone === "warn"
                ? "secondary"
                : "destructive"
          }
        >
          {headline.label}
        </Badge>
        <span className="text-muted-foreground">{headline.detail}</span>
      </div>

      {!si && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground">
          No <code>secrets_injection</code> field on this sandbox's config.
          Sandboxes created before the diagnostic field was deployed don't carry
          this stamp — create a fresh sandbox to see the full status.
        </div>
      )}

      {si && (
        <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 font-mono">
          <KV
            k="Attempted"
            v={si.attempted ? "yes" : "no"}
            tone={si.attempted ? "success" : "warn"}
          />
          <KV
            k="Fetched count"
            v={`${si.fetched_count ?? 0} secret(s)`}
            tone={(si.fetched_count ?? 0) > 0 ? "success" : "warn"}
          />
          <KV k="HTTP status" v={String(si.status_code ?? "—")} />
          <KV k="Fetched at" v={si.fetched_at ?? "—"} />
          <KV
            k="MATRX_AIDREAM_URL set"
            v={si.aidream_url_set ? "yes" : "NO ← fix"}
            tone={si.aidream_url_set ? "success" : "danger"}
          />
          <KV
            k="MATRX_AIDREAM_SERVICE_TOKEN set"
            v={si.aidream_service_token_set ? "yes" : "NO ← fix"}
            tone={si.aidream_service_token_set ? "success" : "danger"}
          />
          <KV
            k="user_id on request"
            v={si.user_id_set ? "yes" : "NO ← fix"}
            tone={si.user_id_set ? "success" : "danger"}
          />
          {si.skipped_reason && (
            <KV k="Skipped because" v={si.skipped_reason} tone="warn" full />
          )}
          {si.error && <KV k="Error" v={si.error} tone="danger" full />}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground shrink-0">
        This shows whether the orchestrator's call to aidream's
        <code className="px-1">
          /api/user-secrets/internal/sandbox-env-for-user
        </code>
        succeeded. Vault contents are merged into{" "}
        <code>docker run -e KEY=value</code> on container create — so an
        existing sandbox can't pick up new secrets; you need a fresh box.
      </div>
    </div>
  );
}

function headlineFor(si: SandboxDiagnostics["secrets_injection"]): {
  label: string;
  detail: string;
  tone: "success" | "warn" | "danger";
} {
  if (!si) {
    return {
      label: "Unknown",
      detail: "no diagnostic stamp",
      tone: "warn",
    };
  }
  if (!si.attempted) {
    return {
      label: "Skipped",
      detail: si.skipped_reason ?? "no reason recorded",
      tone: "warn",
    };
  }
  if ((si.status_code ?? 0) === 200 && (si.fetched_count ?? 0) > 0) {
    return {
      label: "Injected",
      detail: `${si.fetched_count} secret(s) merged into container env`,
      tone: "success",
    };
  }
  if ((si.status_code ?? 0) === 200) {
    return {
      label: "Empty",
      detail: "aidream returned 200 but no secrets for this user",
      tone: "warn",
    };
  }
  if (si.error) {
    return {
      label: "Failed",
      detail: si.error,
      tone: "danger",
    };
  }
  return {
    label: "Unknown",
    detail: `attempted, HTTP ${si.status_code ?? "?"}`,
    tone: "warn",
  };
}

function KV({
  k,
  v,
  tone,
  full,
}: {
  k: string;
  v: string;
  tone?: "success" | "warn" | "danger";
  full?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 ${full ? "col-span-1 md:col-span-2" : ""}`}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {k}
      </span>
      <span
        className={
          tone === "success"
            ? "text-success break-all"
            : tone === "warn"
              ? "text-warning break-all"
              : tone === "danger"
                ? "text-destructive break-all"
                : "break-all"
        }
      >
        {v}
      </span>
    </div>
  );
}
