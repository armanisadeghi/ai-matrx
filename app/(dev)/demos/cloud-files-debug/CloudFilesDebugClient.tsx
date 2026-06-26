"use client";

/**
 * Cloud Files API — diagnostic harness.
 *
 * Surfaces every part of the cloud-files plumbing that can fail silently:
 * the resolved backend URL (which respects the admin localhost toggle),
 * the Supabase JWT, and the per-request response body / headers / timing.
 *
 * Use this page when:
 *   • Uploads "succeed" but nothing hits the local Python server.
 *   • You want to test an individual endpoint without going through Redux.
 *   • You need to confirm the X-Request-Id correlation works.
 *
 * Everything is fired against the same `resolveBaseUrl()` that the production
 * client uses, so what you see here is exactly what the rest of the app
 * sees. There is no mocking.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  ExternalLink,
  FolderTree,
  Globe,
  HardDriveUpload,
  Heart,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  Upload,
  User as UserIcon,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import {
  selectActiveServer,
  selectAllServerHealth,
  selectCustomUrl,
  selectResolvedBaseUrl,
  switchServer,
  setCustomUrl,
  type ServerEnvironment,
} from "@/lib/redux/slices/apiConfigSlice";
import { resolveBaseUrl, newRequestId } from "@/lib/python-client";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  ts: number;
  durationMs: number | null;
  method: string;
  url: string;
  requestId: string;
  status: number | "pending" | "error" | "success";
  httpStatus: number | null;
  ok: boolean | null;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  error: string | null;
}

function maskJwt(token: string | null): string {
  if (!token) return "—";
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}…${token.slice(-6)}`;
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function pretty(value: string | null): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function statusColor(httpStatus: number | null): string {
  if (httpStatus == null) return "text-muted-foreground";
  if (httpStatus >= 200 && httpStatus < 300) return "text-success";
  if (httpStatus >= 400 && httpStatus < 500) return "text-warning";
  if (httpStatus >= 500) return "text-destructive";
  return "text-muted-foreground";
}

// ─── Component ────────────────────────────────────────────────────────────

export function CloudFilesDebugClient() {
  const dispatch = useAppDispatch();
  const activeServer = useAppSelector(selectActiveServer);
  const customUrl = useAppSelector(selectCustomUrl);
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const allServerHealth = useAppSelector(selectAllServerHealth);

  const [jwt, setJwt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [customUrlDraft, setCustomUrlDraft] = useState<string>(
    customUrl ?? "",
  );

  // Raw tester
  const [rawMethod, setRawMethod] = useState<"GET" | "POST" | "PATCH" | "DELETE">("GET");
  const [rawPath, setRawPath] = useState<string>("/health");
  const [rawBody, setRawBody] = useState<string>("");

  // Upload tester
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFolder, setUploadFolder] = useState<string>("Images/Debug");
  const [uploadVisibility, setUploadVisibility] = useState<
    "private" | "shared" | "public"
  >("private");

  // Last uploaded file id (for follow-up tests)
  const [lastFileId, setLastFileId] = useState<string | null>(null);

  // Refresh JWT + user on mount and on demand
  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setJwt(null);
      setUserId(null);
      setUserEmail(null);
      return;
    }
    setJwt(data.session?.access_token ?? null);
    setUserId(data.session?.user.id ?? null);
    setUserEmail(data.session?.user.email ?? null);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // ─── Core test runner: full visibility into every fetch ──────────────────

  const runFetch = useCallback(
    async (
      key: string,
      args: {
        method: "GET" | "POST" | "PATCH" | "DELETE";
        path: string;
        body?: BodyInit | null;
        contentType?: string;
        skipBaseUrl?: boolean;
        bypassJwt?: boolean;
      },
    ): Promise<LogEntry> => {
      setRunning((r) => ({ ...r, [key]: true }));
      const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const requestId = newRequestId();
      const startMs = performance.now();

      let url: string;
      try {
        url = args.skipBaseUrl
          ? args.path
          : `${resolveBaseUrl()}${args.path}`;
      } catch (err) {
        const entry: LogEntry = {
          id,
          ts: Date.now(),
          durationMs: 0,
          method: args.method,
          url: args.path,
          requestId,
          status: "error",
          httpStatus: null,
          ok: false,
          requestHeaders: {},
          requestBody: null,
          responseHeaders: null,
          responseBody: null,
          error: extractErrorMessage(err),
        };
        setLogs((l) => [entry, ...l]);
        setRunning((r) => ({ ...r, [key]: false }));
        return entry;
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Request-Id": requestId,
      };
      if (jwt && !args.bypassJwt) headers.Authorization = `Bearer ${jwt}`;
      if (args.contentType) headers["Content-Type"] = args.contentType;

      // Determine the body display + payload
      let requestBodyText: string | null = null;
      let bodyToSend: BodyInit | null | undefined = args.body;
      if (typeof args.body === "string") {
        requestBodyText = args.body;
      } else if (args.body instanceof FormData) {
        // FormDataEntryValue is `string | File` per TS lib.dom; File extends
        // Blob, so the File branch already covers blob-ish values.
        const fields: string[] = [];
        args.body.forEach((value, key) => {
          if (value instanceof File) {
            fields.push(
              `${key}=<File name="${value.name}" type="${value.type}" size=${value.size}>`,
            );
          } else {
            fields.push(`${key}=${String(value)}`);
          }
        });
        requestBodyText = `[multipart/form-data]\n${fields.join("\n")}`;
      }

      let resp: Response;
      try {
        resp = await fetch(url, {
          method: args.method,
          headers,
          body: bodyToSend ?? undefined,
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - startMs);
        const message = extractErrorMessage(err);
        const entry: LogEntry = {
          id,
          ts: Date.now(),
          durationMs,
          method: args.method,
          url,
          requestId,
          status: "error",
          httpStatus: null,
          ok: false,
          requestHeaders: headers,
          requestBody: requestBodyText,
          responseHeaders: null,
          responseBody: null,
          error: `Network error: ${message}. The browser couldn't reach the server. Most likely causes: server not running, CORS, or wrong URL.`,
        };
        setLogs((l) => [entry, ...l]);
        setRunning((r) => ({ ...r, [key]: false }));
        return entry;
      }

      const durationMs = Math.round(performance.now() - startMs);
      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      let responseBody: string;
      try {
        responseBody = await resp.text();
      } catch (err) {
        responseBody = `<failed to read body: ${extractErrorMessage(err)}>`;
      }

      const entry: LogEntry = {
        id,
        ts: Date.now(),
        durationMs,
        method: args.method,
        url,
        requestId,
        status: resp.ok ? "success" : "error",
        httpStatus: resp.status,
        ok: resp.ok,
        requestHeaders: headers,
        requestBody: requestBodyText,
        responseHeaders,
        responseBody,
        error: resp.ok ? null : `HTTP ${resp.status} ${resp.statusText}`,
      };
      setLogs((l) => [entry, ...l]);
      setRunning((r) => ({ ...r, [key]: false }));

      // Auto-extract fileId from upload responses for follow-up tests
      if (resp.ok && args.path === "/files/upload") {
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.file_id) setLastFileId(parsed.file_id);
        } catch {
          // ignore
        }
      }
      return entry;
    },
    [jwt],
  );

  // ─── Test handlers ───────────────────────────────────────────────────────

  const onHealth = useCallback(() => {
    void runFetch("health", { method: "GET", path: "/health" });
  }, [runFetch]);

  const onTree = useCallback(() => {
    if (!userId) return;
    // Cloud-files exposes the tree as a Supabase RPC (get_user_file_tree),
    // not a Python /files/* endpoint. Test it via the supabase-js client so
    // the user sees whether reads work even if the Python server is down.
    void (async () => {
      const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ts = Date.now();
      const startMs = performance.now();
      setRunning((r) => ({ ...r, tree: true }));
      try {
        const { data, error } = await supabase.rpc("get_user_file_tree", {
          p_user_id: userId,
        });
        const durationMs = Math.round(performance.now() - startMs);
        const entry: LogEntry = {
          id,
          ts,
          durationMs,
          method: "RPC",
          url: "supabase://rpc/get_user_file_tree",
          requestId: "—",
          status: error ? "error" : "success",
          httpStatus: null,
          ok: !error,
          requestHeaders: { "via": "supabase-js" },
          requestBody: JSON.stringify({ p_user_id: userId }, null, 2),
          responseHeaders: null,
          responseBody: JSON.stringify(
            error
              ? { error }
              : { rowCount: Array.isArray(data) ? data.length : 0, sample: Array.isArray(data) ? data.slice(0, 3) : data },
            null,
            2,
          ),
          error: error ? error.message : null,
        };
        setLogs((l) => [entry, ...l]);
      } finally {
        setRunning((r) => ({ ...r, tree: false }));
      }
    })();
  }, [userId]);

  const onFilesList = useCallback(() => {
    void runFetch("filesList", { method: "GET", path: "/files" });
  }, [runFetch]);

  const onUpload = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("file_path", `${uploadFolder.replace(/\/$/, "")}/${file.name}`);
      form.append("visibility", uploadVisibility);
      await runFetch("upload", {
        method: "POST",
        path: "/files/upload",
        body: form,
      });
    },
    [runFetch, uploadFolder, uploadVisibility],
  );

  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      void onUpload(file);
      e.target.value = "";
    },
    [onUpload],
  );

  const onSignedUrl = useCallback(() => {
    if (!lastFileId) return;
    void runFetch("signedUrl", {
      method: "GET",
      path: `/files/${lastFileId}/url?expires_in=3600`,
    });
  }, [lastFileId, runFetch]);

  const onDownloadFile = useCallback(() => {
    if (!lastFileId) return;
    void runFetch("download", {
      method: "GET",
      path: `/files/${lastFileId}/download`,
    });
  }, [lastFileId, runFetch]);

  const onDeleteFile = useCallback(() => {
    if (!lastFileId) return;
    void runFetch("deleteFile", {
      method: "DELETE",
      path: `/files/${lastFileId}`,
    });
  }, [lastFileId, runFetch]);

  const onRawSend = useCallback(() => {
    const trimmedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const hasBody = rawMethod !== "GET" && rawMethod !== "DELETE" && rawBody.trim();
    void runFetch("raw", {
      method: rawMethod,
      path: trimmedPath,
      body: hasBody ? rawBody : null,
      contentType: hasBody ? "application/json" : undefined,
    });
  }, [rawMethod, rawPath, rawBody, runFetch]);

  // ─── Server-toggle UI handlers ───────────────────────────────────────────

  const onSwitchServer = useCallback(
    (env: ServerEnvironment) => {
      void dispatch(switchServer({ env }));
    },
    [dispatch],
  );

  const onApplyCustomUrl = useCallback(() => {
    if (!customUrlDraft.trim()) return;
    dispatch(setCustomUrl(customUrlDraft.trim()));
    void dispatch(switchServer({ env: "custom", customUrl: customUrlDraft.trim() }));
  }, [customUrlDraft, dispatch]);

  // ─── Derived state ───────────────────────────────────────────────────────

  const activeHealth = useMemo(
    () => allServerHealth.find((h) => h.isActive),
    [allServerHealth],
  );

  const clearLogs = () => setLogs([]);

  const toggleExpand = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Cloud Files Debug</h1>
              <p className="text-xs text-muted-foreground">
                Diagnose every step of the cloud-files request pipeline. No mocks.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshSession()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh session
          </Button>
        </header>

        {/* Configuration panel */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Configuration</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <FieldBlock
                icon={<Globe className="h-3.5 w-3.5" />}
                label="Active backend URL"
                value={baseUrl ?? "(not configured)"}
                mono
                tone={baseUrl ? "default" : "destructive"}
              />
              <FieldBlock
                icon={<KeyRound className="h-3.5 w-3.5" />}
                label="JWT"
                value={maskJwt(jwt)}
                mono
                tone={jwt ? "success" : "destructive"}
              />
              <FieldBlock
                icon={<UserIcon className="h-3.5 w-3.5" />}
                label="User"
                value={userEmail ?? userId ?? "(no session)"}
                mono
                tone={userId ? "default" : "destructive"}
              />
            </div>

            {/* Server picker */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Active server (changes apply to the entire app)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allServerHealth.map((row) => {
                  const isActive = row.isActive;
                  const tone = !row.isConfigured
                    ? "border-border text-muted-foreground"
                    : isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent";
                  return (
                    <button
                      key={row.env}
                      type="button"
                      onClick={() => onSwitchServer(row.env)}
                      disabled={!row.isConfigured}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        tone,
                      )}
                      title={row.resolvedUrl ?? "(not configured)"}
                    >
                      <span className="font-medium">{row.env}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                        {row.resolvedUrl
                          ? row.resolvedUrl.replace(/^https?:\/\//, "")
                          : "—"}
                      </span>
                      <HealthDot status={row.health.status} />
                    </button>
                  );
                })}
              </div>

              {activeServer === "custom" && (
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="url"
                    value={customUrlDraft}
                    onChange={(e) => setCustomUrlDraft(e.target.value)}
                    placeholder="https://my-server.example.com"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button size="sm" onClick={onApplyCustomUrl}>
                    Apply
                  </Button>
                </div>
              )}

              {activeHealth && (
                <p className="text-[11px] text-muted-foreground">
                  Health: {activeHealth.health.status}
                  {activeHealth.health.latencyMs != null
                    ? ` · ${activeHealth.health.latencyMs}ms`
                    : ""}
                  {activeHealth.health.error
                    ? ` · ${activeHealth.health.error}`
                    : ""}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Quick tests */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Quick tests</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              All calls are real — fired against the active server above.
            </span>
          </div>

          <div className="p-3 space-y-3">
            {/* Row 1: read paths */}
            <div className="flex flex-wrap gap-1.5">
              <TestButton
                running={!!running.health}
                onClick={onHealth}
                icon={<Heart className="h-3.5 w-3.5" />}
                label="GET /health"
                hint="Confirms the server is reachable. No auth needed."
              />
              <TestButton
                running={!!running.tree}
                onClick={onTree}
                icon={<FolderTree className="h-3.5 w-3.5" />}
                label="RPC get_user_file_tree"
                hint="Reads the full tree via Supabase RPC. Bypasses Python."
                disabled={!userId}
              />
              <TestButton
                running={!!running.filesList}
                onClick={onFilesList}
                icon={<FolderTree className="h-3.5 w-3.5" />}
                label="GET /files"
                hint="Lists files (Python endpoint, JWT required)."
                disabled={!jwt}
              />
            </div>

            {/* Row 2: upload */}
            <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
              <p className="text-xs font-medium">Upload test</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Folder:</span>
                  <input
                    type="text"
                    value={uploadFolder}
                    onChange={(e) => setUploadFolder(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 font-mono w-56"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Visibility:</span>
                  <select
                    value={uploadVisibility}
                    onChange={(e) =>
                      setUploadVisibility(
                        e.target.value as typeof uploadVisibility,
                      )
                    }
                    className="rounded-md border border-border bg-background px-2 py-1"
                  >
                    <option value="private">private</option>
                    <option value="shared">shared</option>
                    <option value="public">public</option>
                  </select>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={onFilePicked}
                />
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!jwt || !!running.upload}
                  className="gap-1.5"
                >
                  {running.upload ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HardDriveUpload className="h-3.5 w-3.5" />
                  )}
                  Pick file & upload
                </Button>
              </div>
              {lastFileId && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  Last uploaded fileId:{" "}
                  <span className="text-foreground">{lastFileId}</span>
                </p>
              )}
            </div>

            {/* Row 3: post-upload tests (only enabled with a fileId) */}
            <div className="flex flex-wrap gap-1.5">
              <TestButton
                running={!!running.signedUrl}
                onClick={onSignedUrl}
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                label="GET /files/{id}/url"
                hint="Get a signed URL for the last uploaded file."
                disabled={!lastFileId || !jwt}
              />
              <TestButton
                running={!!running.download}
                onClick={onDownloadFile}
                icon={<Download className="h-3.5 w-3.5" />}
                label="GET /files/{id}/download"
                hint="Stream bytes for the last uploaded file."
                disabled={!lastFileId || !jwt}
              />
              <TestButton
                running={!!running.deleteFile}
                onClick={onDeleteFile}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="DELETE /files/{id}"
                hint="Soft-delete the last uploaded file."
                disabled={!lastFileId || !jwt}
                tone="destructive"
              />
            </div>
          </div>
        </section>

        {/* Raw API tester */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Raw request</h2>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {baseUrl ?? "(no base URL)"}
            </span>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs">
              <select
                value={rawMethod}
                onChange={(e) =>
                  setRawMethod(e.target.value as typeof rawMethod)
                }
                className="rounded-md border border-border bg-background px-2 py-1.5 font-mono"
              >
                <option>GET</option>
                <option>POST</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
              <input
                type="text"
                value={rawPath}
                onChange={(e) => setRawPath(e.target.value)}
                placeholder="/files/tree"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono"
              />
              <Button size="sm" onClick={onRawSend} disabled={!!running.raw}>
                {running.raw ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Send"
                )}
              </Button>
            </div>
            {(rawMethod === "POST" || rawMethod === "PATCH") && (
              <textarea
                value={rawBody}
                onChange={(e) => setRawBody(e.target.value)}
                placeholder='{"key": "value"}'
                rows={4}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            )}
          </div>
        </section>

        {/* Event log */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">
                Event log ({logs.length})
              </h2>
            </div>
            {logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={clearLogs}
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
          <div className="divide-y divide-border">
            {logs.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No events yet. Fire a test above.
              </div>
            )}
            {logs.map((entry) => (
              <LogRow
                key={entry.id}
                entry={entry}
                expanded={!!expanded[entry.id]}
                onToggle={() => toggleExpand(entry.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function FieldBlock({
  icon,
  label,
  value,
  mono,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  tone?: "default" | "success" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "truncate text-xs",
          mono && "font-mono",
          toneClass,
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function HealthDot({ status }: { status: string }) {
  const color =
    status === "healthy"
      ? "bg-success"
      : status === "unhealthy"
        ? "bg-destructive"
        : status === "checking"
          ? "bg-warning animate-pulse"
          : "bg-muted-foreground/40";
  return <span className={cn("h-1.5 w-1.5 rounded-full", color)} />;
}

function TestButton({
  running,
  onClick,
  icon,
  label,
  hint,
  disabled,
  tone = "default",
}: {
  running: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  tone?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || running}
      title={hint}
      className={cn(
        "group flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "destructive"
          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
          : "border-border hover:bg-accent",
      )}
    >
      {running ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        icon
      )}
      <span className="font-mono">{label}</span>
    </button>
  );
}

function LogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = entry.ok
    ? CheckCircle2
    : entry.status === "pending"
      ? Loader2
      : AlertCircle;
  const iconClass = entry.ok
    ? "text-success"
    : entry.status === "pending"
      ? "text-muted-foreground animate-spin"
      : "text-destructive";

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClass)} />
        <span className="font-mono w-20 shrink-0 text-muted-foreground">
          {fmtTs(entry.ts)}
        </span>
        <span className="font-mono w-14 shrink-0 font-semibold">
          {entry.method}
        </span>
        <span className="font-mono flex-1 truncate">{entry.url}</span>
        <span
          className={cn(
            "font-mono w-12 shrink-0 text-right",
            statusColor(entry.httpStatus),
          )}
        >
          {entry.httpStatus ?? "ERR"}
        </span>
        <span className="font-mono w-14 shrink-0 text-right text-muted-foreground">
          {entry.durationMs != null ? `${entry.durationMs}ms` : "—"}
        </span>
      </button>

      {expanded && (
        <div className="bg-muted/30 border-t border-border px-3 py-2 space-y-2 font-mono text-[11px]">
          <DetailBlock label="Request URL" value={`${entry.method} ${entry.url}`} />
          <DetailBlock
            label="X-Request-Id"
            value={entry.requestId}
          />
          <DetailBlock
            label="Request headers"
            value={JSON.stringify(entry.requestHeaders, null, 2)}
            preformatted
          />
          {entry.requestBody && (
            <DetailBlock
              label="Request body"
              value={pretty(entry.requestBody)}
              preformatted
            />
          )}
          {entry.responseHeaders && (
            <DetailBlock
              label="Response headers"
              value={JSON.stringify(entry.responseHeaders, null, 2)}
              preformatted
            />
          )}
          {entry.responseBody !== null && (
            <DetailBlock
              label="Response body"
              value={pretty(entry.responseBody)}
              preformatted
              tone={entry.ok ? "default" : "destructive"}
            />
          )}
          {entry.error && (
            <DetailBlock label="Error" value={entry.error} tone="destructive" />
          )}
        </div>
      )}
    </div>
  );
}

function DetailBlock({
  label,
  value,
  preformatted,
  tone = "default",
}: {
  label: string;
  value: string;
  preformatted?: boolean;
  tone?: "default" | "destructive";
}) {
  const toneClass = tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {preformatted ? (
        <pre
          className={cn(
            "whitespace-pre-wrap break-all rounded border border-border bg-background p-1.5 max-h-64 overflow-auto",
            toneClass,
          )}
        >
          {value || "(empty)"}
        </pre>
      ) : (
        <div className={cn("break-all", toneClass)}>{value || "—"}</div>
      )}
    </div>
  );
}
