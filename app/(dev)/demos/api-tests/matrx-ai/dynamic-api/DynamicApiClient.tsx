"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractErrorMessage } from "@/utils/errors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  Play,
  Square,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  Loader2,
  RotateCcw,
  BookOpen,
  Clock,
  ExternalLink,
  Search,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { useServerConfig } from "../_shared/useServerConfig";
import { ServerBar } from "../_shared/ServerBar";

// ─── Types ────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type ExecStatus = "idle" | "connecting" | "running" | "complete" | "error";

interface KVPair {
  key: string;
  value: string;
  enabled: boolean;
}

interface SavedRequest {
  id: string;
  method: HttpMethod;
  path: string;
  savedAt: string;
}

interface ApiEndpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  hasBody: boolean;
  schema: unknown;
}

const SAVED_KEY = "matrx-ai-dynamic-requests";
const BODY_METHODS: HttpMethod[] = ["POST", "PUT", "PATCH"];

// ─── Static doc links ─────────────────────────────────────────────────────────

const STATIC_DOC_LINKS = [
  {
    label: "Coolify API",
    url: "http://localhost:8000/api/v1",
    desc: "Coolify REST API (local)",
  },
  {
    label: "Scraper API",
    url: "https://scraper.app.matrxserver.com/api/v1/",
    desc: "Scraper service REST",
  },
  {
    label: "Scraper Docs",
    url: "https://scraper.app.matrxserver.com/docs",
    desc: "Scraper Swagger UI",
  },
] as const;

// ─── Pre-built templates ──────────────────────────────────────────────────────

const TEMPLATES: Array<{
  label: string;
  method: HttpMethod;
  path: string;
  body?: string;
}> = [
  { label: "Health Check", method: "GET", path: "/health" },
  { label: "Health Detailed", method: "GET", path: "/health/detailed" },
  { label: "Health Ready", method: "GET", path: "/health/ready" },
  {
    label: "Chat (streaming)",
    method: "POST",
    path: "/ai/chat",
    body: JSON.stringify(
      {
        ai_model_id: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "Hello!" }],
        stream: true,
        debug: false,
      },
      null,
      2,
    ),
  },
  {
    label: "Chat (non-stream)",
    method: "POST",
    path: "/ai/chat",
    body: JSON.stringify(
      {
        ai_model_id: "gpt-4o",
        messages: [{ role: "user", content: "What is 2 + 2?" }],
        stream: false,
      },
      null,
      2,
    ),
  },
  {
    label: "Start Agent",
    method: "POST",
    path: "/ai/agents/{agent_id}",
    body: JSON.stringify(
      { user_input: "Hello!", stream: true, debug: false },
      null,
      2,
    ),
  },
  { label: "Warm Agent", method: "POST", path: "/ai/agents/{agent_id}/warm" },
  {
    label: "Continue Conversation",
    method: "POST",
    path: "/ai/conversations/{conversation_id}",
    body: JSON.stringify(
      { user_input: "Continue please", debug: false },
      null,
      2,
    ),
  },
  {
    label: "Warm Conversation",
    method: "POST",
    path: "/ai/conversations/{conversation_id}/warm",
  },
  { label: "List Tools", method: "GET", path: "/tools/test/list" },
  {
    label: "Execute Tool",
    method: "POST",
    path: "/tools/test/execute",
    body: JSON.stringify(
      { tool_name: "search", arguments: { q: "hello world" } },
      null,
      2,
    ),
  },
];

// ─── OpenAPI helpers ──────────────────────────────────────────────────────────

function parseOpenApiSpec(spec: Record<string, unknown>): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const validMethods = ["get", "post", "put", "patch", "delete"];

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!validMethods.includes(method)) continue;
      const op = operation as Record<string, unknown>;
      const hasBody = BODY_METHODS.includes(method.toUpperCase() as HttpMethod);
      const reqBody = op.requestBody as Record<string, unknown> | undefined;
      const schema = reqBody?.content
        ? (reqBody.content as Record<string, Record<string, unknown>>)?.[
            "application/json"
          ]?.schema
        : null;
      endpoints.push({
        method: method.toUpperCase() as HttpMethod,
        path,
        summary: (op.summary as string) || (op.operationId as string) || path,
        hasBody,
        schema: schema ?? null,
      });
    }
  }
  return endpoints.sort((a, b) => a.path.localeCompare(b.path));
}

function schemaToExampleBody(
  schema: unknown,
  components: Record<string, unknown>,
): string {
  if (!schema) return "";
  const s = schema as Record<string, unknown>;

  if ("$ref" in s && typeof s["$ref"] === "string") {
    const name = s["$ref"].split("/").pop() ?? "";
    const schemas =
      (components as Record<string, Record<string, unknown>>).schemas ?? {};
    return schemaToExampleBody(schemas[name], components);
  }

  if (s.type === "object" || s.properties) {
    const props = (s.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const required = (s.required ?? []) as string[];
    const obj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(props)) {
      if (!required.includes(key)) continue;
      if (val.type === "string") obj[key] = val.example ?? "";
      else if (val.type === "integer" || val.type === "number")
        obj[key] = val.example ?? 0;
      else if (val.type === "boolean") obj[key] = val.example ?? false;
      else if (val.type === "array") obj[key] = [];
      else if (val.type === "object") obj[key] = {};
      else obj[key] = null;
    }
    return JSON.stringify(obj, null, 2);
  }
  return "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 gap-1"
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function methodColor(method: HttpMethod) {
  const colors: Record<HttpMethod, string> = {
    GET: "text-green-600 dark:text-green-400",
    POST: "text-blue-600 dark:text-blue-400",
    PUT: "text-orange-600 dark:text-orange-400",
    PATCH: "text-yellow-600 dark:text-yellow-400",
    DELETE: "text-destructive",
  };
  return colors[method];
}

function methodBg(method: HttpMethod) {
  const colors: Record<HttpMethod, string> = {
    GET: "bg-green-500/10 text-green-700 dark:text-green-400",
    POST: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    PUT: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    PATCH: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    DELETE: "bg-destructive/10 text-destructive",
  };
  return colors[method];
}

function statusColor(code: number): string {
  if (code < 200) return "text-muted-foreground";
  if (code < 300) return "text-green-600 dark:text-green-400";
  if (code < 400) return "text-yellow-600";
  if (code < 500) return "text-orange-600";
  return "text-destructive";
}

function tryPrettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function KVEditor({
  pairs,
  onChange,
  placeholder = "Value",
}: {
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  placeholder?: string;
}) {
  const add = () => onChange([...pairs, { key: "", value: "", enabled: true }]);
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof KVPair, v: string | boolean) => {
    const next = [...pairs];
    next[i] = { ...next[i], [field]: v };
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {pairs.map((pair, i) => (
        <div
          key={i}
          className={`flex gap-1 items-center ${!pair.enabled ? "opacity-40" : ""}`}
        >
          <label className="inline-flex items-center cursor-pointer flex-shrink-0">
            <Checkbox
              checked={pair.enabled}
              onCheckedChange={(v) => update(i, "enabled", v === true)}
              className="h-3 w-3"
            />
          </label>
          <Input
            value={pair.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder="Key"
            className="h-6 text-xs font-mono flex-1 min-w-0"
          />
          <Input
            value={pair.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder={placeholder}
            className="h-6 text-xs flex-1 min-w-0"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => remove(i)}
            className="h-6 w-6 p-0 flex-shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={add}
        className="h-6 text-[10px] gap-1 px-2"
      >
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DynamicApiClient() {
  const config = useServerConfig();

  // Request
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("/health");
  const [headers, setHeaders] = useState<KVPair[]>([
    { key: "Content-Type", value: "application/json", enabled: true },
  ]);
  const [body, setBody] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Response
  const [execStatus, setExecStatus] = useState<ExecStatus>("idle");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [responseBody, setResponseBody] = useState("");
  const [responseHeaders, setResponseHeaders] = useState<[string, string][]>(
    [],
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ start: number; end: number | null }>({
    start: 0,
    end: null,
  });

  // Saved + OpenAPI
  const [saved, setSaved] = useState<SavedRequest[]>([]);
  const [openApiEndpoints, setOpenApiEndpoints] = useState<ApiEndpoint[]>([]);
  const [openApiRaw, setOpenApiRaw] = useState<unknown>(null);
  const [openApiLoading, setOpenApiLoading] = useState(false);
  const [endpointFilter, setEndpointFilter] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = execStatus === "connecting" || execStatus === "running";
  const hasBody = BODY_METHODS.includes(method);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Sync auth header from token
  useEffect(() => {
    if (config.authToken) {
      setHeaders((prev) => {
        const withoutAuth = prev.filter(
          (h) => h.key.toLowerCase() !== "authorization",
        );
        return [
          {
            key: "Authorization",
            value: `Bearer ${config.authToken}`,
            enabled: true,
          },
          ...withoutAuth,
        ];
      });
    }
  }, [config.authToken]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearResponse = () => {
    setStatusCode(null);
    setStatusText("");
    setResponseBody("");
    setResponseHeaders([]);
    setErrorMessage("");
    setExecStatus("idle");
    setTiming({ start: 0, end: null });
  };

  const persistSaved = (reqs: SavedRequest[]) => {
    setSaved(reqs);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(reqs));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isRunning) handleExecute();
      }
      if (e.key === "Escape" && isRunning) handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, method, path, headers, body, isStreaming]);

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setMethod(tpl.method);
    setPath(tpl.path);
    if (tpl.body) setBody(tpl.body);
    clearResponse();
  };

  const applyEndpoint = (ep: ApiEndpoint) => {
    setMethod(ep.method);
    setPath(ep.path);
    if (ep.hasBody && ep.schema && openApiRaw) {
      const components =
        (openApiRaw as Record<string, unknown>).components ?? {};
      const generated = schemaToExampleBody(
        ep.schema,
        components as Record<string, unknown>,
      );
      if (generated) setBody(generated);
    }
    clearResponse();
    toast.info(`Loaded: ${ep.method} ${ep.path}`);
  };

  const fetchOpenApiSpec = async () => {
    setOpenApiLoading(true);
    try {
      const res = await fetch(`${config.serverUrl}/openapi.json`, {
        headers: config.authHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const spec = await res.json();
      const endpoints = parseOpenApiSpec(spec);
      setOpenApiEndpoints(endpoints);
      setOpenApiRaw(spec);
      toast.success(`Loaded ${endpoints.length} endpoints from spec`);
    } catch (err) {
      toast.error("Failed to fetch OpenAPI spec", {
        description: extractErrorMessage(err),
      });
    } finally {
      setOpenApiLoading(false);
    }
  };

  const handleExecute = async () => {
    if (isRunning) return;
    clearResponse();
    const start = Date.now();
    setTiming({ start, end: null });
    setExecStatus("connecting");
    stopTimer();
    timerRef.current = setInterval(() => setTiming((t) => ({ ...t })), 100);

    const controller = new AbortController();
    abortRef.current = controller;
    const url = `${config.serverUrl}${path.startsWith("/") ? path : "/" + path}`;

    const reqHeaders: Record<string, string> = {};
    for (const h of headers) {
      if (h.enabled && h.key.trim()) reqHeaders[h.key.trim()] = h.value;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: reqHeaders,
      signal: controller.signal,
    };
    if (hasBody && body.trim()) fetchOptions.body = body.trim();

    try {
      const res = await fetch(url, fetchOptions);
      setStatusCode(res.status);
      setStatusText(res.statusText);
      const rHeaders: [string, string][] = [];
      res.headers.forEach((val, key) => rHeaders.push([key, val]));
      setResponseHeaders(rHeaders);
      setExecStatus("running");

      const contentType = res.headers.get("content-type") ?? "";
      const isNdjson =
        contentType.includes("application/x-ndjson") ||
        contentType.includes("text/event-stream");

      if ((isStreaming || isNdjson) && res.body) {
        const { events } = parseNdjsonStream(res, controller.signal);
        let collected = "";
        for await (const evt of events) {
          const line = JSON.stringify(evt, null, 2) + "\n\n";
          collected += line;
          setResponseBody(collected);
        }
      } else {
        const text = await res.text();
        setResponseBody(text);
      }

      stopTimer();
      setTiming({ start, end: Date.now() });
      setExecStatus("complete");
    } catch (err) {
      stopTimer();
      setTiming({ start, end: Date.now() });
      if (controller.signal.aborted) {
        setExecStatus("idle");
        toast.info("Cancelled");
      } else {
        const msg = err instanceof Error ? err.message : "Request failed";
        setErrorMessage(msg);
        setExecStatus("error");
        toast.error(msg);
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopTimer();
  };

  const saveRequest = () => {
    const req: SavedRequest = {
      id: Date.now().toString(),
      method,
      path,
      savedAt: new Date().toLocaleTimeString(),
    };
    persistSaved([req, ...saved].slice(0, 20));
    toast.success("Request saved");
  };

  const filteredEndpoints = openApiEndpoints.filter(
    (e) =>
      !endpointFilter ||
      e.path.toLowerCase().includes(endpointFilter.toLowerCase()) ||
      e.method.includes(endpointFilter.toUpperCase()) ||
      e.summary.toLowerCase().includes(endpointFilter.toLowerCase()),
  );

  const fullUrl = `${config.serverUrl}${path.startsWith("/") ? path : "/" + path}`;
  const elapsedMs = timing.end
    ? timing.end - timing.start
    : timing.start
      ? Date.now() - timing.start
      : null;

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="flex-shrink-0 px-3 pt-2 pb-0">
          <ServerBar
            config={config}
            title={
              <div className="flex items-center gap-2 flex-shrink-0">
                <Zap className="h-4 w-4 text-primary" />
                <h1 className="text-base font-bold">Dynamic API</h1>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  Postman-style tester
                </Badge>
              </div>
            }
          />
        </div>

        {/* URL bar */}
        <div className="flex-shrink-0 px-3 pt-2 pb-1">
          <div className="flex gap-2 items-center">
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as HttpMethod);
                if (!BODY_METHODS.includes(v as HttpMethod))
                  setIsStreaming(false);
              }}
            >
              <SelectTrigger
                className={`h-9 w-28 text-xs font-bold ${methodColor(method)}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]
                ).map((m) => (
                  <SelectItem
                    key={m}
                    value={m}
                    className={`text-xs font-bold ${methodColor(m)}`}
                  >
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/health"
              className="h-9 text-sm font-mono flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isRunning) handleExecute();
              }}
            />

            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px] hidden lg:block">
              {fullUrl}
            </p>

            {!isRunning ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleExecute}
                    className="h-9 px-4 gap-2 flex-shrink-0"
                  >
                    <Play className="h-4 w-4" /> Send
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Ctrl/Cmd + Enter
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                onClick={handleCancel}
                variant="destructive"
                className="h-9 px-4 gap-2 flex-shrink-0"
              >
                <Square className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 px-3 pb-2">
          <div className="grid grid-cols-12 gap-2 h-full">
            {/* Left: Request config */}
            <Card className="col-span-6 h-full flex flex-col overflow-hidden">
              {/* Body textarea — always visible for POST/PUT/PATCH */}
              {hasBody ? (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3 border-b">
                  <div className="flex items-center justify-between mb-2 flex-shrink-0">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Request Body (JSON)
                    </Label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={isStreaming}
                          onCheckedChange={(v) => setIsStreaming(v === true)}
                          className="h-3 w-3"
                        />
                        Parse NDJSON stream
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-1.5 gap-1"
                        onClick={() => setBody(tryPrettyJson(body))}
                      >
                        Format JSON
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={'{\n  "key": "value"\n}'}
                    className="flex-1 min-h-0 text-xs font-mono resize-none border rounded-md"
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border-b">
                  <p className="text-xs text-muted-foreground">
                    No request body for {method} requests.
                  </p>
                </div>
              )}

              {/* Bottom tabs: Headers, Templates, Saved, Docs */}
              <div
                className={`${hasBody ? "h-[220px]" : "h-full"} flex-shrink-0 flex flex-col overflow-hidden`}
              >
                <Tabs
                  defaultValue="headers"
                  className="flex-1 flex flex-col overflow-hidden min-h-0"
                >
                  <div className="flex items-center justify-between px-3 pt-2 flex-shrink-0">
                    <TabsList className="h-7">
                      <TabsTrigger value="headers" className="text-xs h-6 px-2">
                        Headers
                        {headers.filter((h) => h.enabled && h.key).length >
                          0 && (
                          <Badge
                            variant="secondary"
                            className="ml-1 text-[9px] h-4 px-1"
                          >
                            {headers.filter((h) => h.enabled && h.key).length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="templates"
                        className="text-xs h-6 px-2"
                      >
                        Templates
                      </TabsTrigger>
                      <TabsTrigger value="saved" className="text-xs h-6 px-2">
                        Saved
                        {saved.length > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-1 text-[9px] h-4 px-1"
                          >
                            {saved.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="docs" className="text-xs h-6 px-2">
                        Docs
                      </TabsTrigger>
                    </TabsList>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={saveRequest}
                          className="h-6 text-[10px] px-1.5 gap-1"
                        >
                          <BookOpen className="h-2.5 w-2.5" /> Save
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Save current request
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <TabsContent
                    value="headers"
                    className="flex-1 overflow-y-auto p-3 min-h-0"
                  >
                    <KVEditor
                      pairs={headers}
                      onChange={setHeaders}
                      placeholder="Header value"
                    />
                  </TabsContent>

                  <TabsContent
                    value="templates"
                    className="flex-1 overflow-y-auto p-3 min-h-0"
                  >
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Click to load a pre-built request
                    </p>
                    <div className="space-y-0.5">
                      {TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.label}
                          onClick={() => applyTemplate(tpl)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 hover:bg-muted/80 transition-colors"
                        >
                          <span
                            className={`text-[10px] font-bold w-10 flex-shrink-0 ${methodColor(tpl.method)}`}
                          >
                            {tpl.method}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
                            {tpl.path}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {tpl.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="saved"
                    className="flex-1 overflow-y-auto p-3 min-h-0"
                  >
                    {saved.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No saved requests yet.
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {saved.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center gap-1 group"
                          >
                            <button
                              onClick={() => {
                                setMethod(req.method);
                                setPath(req.path);
                                clearResponse();
                              }}
                              className="flex-1 text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 hover:bg-muted/80 min-w-0"
                            >
                              <span
                                className={`text-[10px] font-bold w-10 flex-shrink-0 ${methodColor(req.method)}`}
                              >
                                {req.method}
                              </span>
                              <span className="font-mono text-[10px] truncate">
                                {req.path}
                              </span>
                            </button>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {req.savedAt}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                persistSaved(
                                  saved.filter((r) => r.id !== req.id),
                                )
                              }
                              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent
                    value="docs"
                    className="flex-1 overflow-y-auto p-3 min-h-0 space-y-3"
                  >
                    {/* Dynamic server links */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                        This Server
                      </p>
                      <div className="space-y-1">
                        {[
                          { label: "Swagger UI", path: "/docs" },
                          { label: "ReDoc", path: "/redoc" },
                          { label: "OpenAPI JSON", path: "/openapi.json" },
                        ].map(({ label, path: p }) => (
                          <a
                            key={p}
                            href={`${config.serverUrl}${p}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted/80 transition-colors group"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1">{label}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                              {config.serverUrl}
                              {p}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* Static links */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                        Other APIs
                      </p>
                      <div className="space-y-1">
                        {STATIC_DOC_LINKS.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted/80 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1 font-medium">
                              {link.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {link.desc}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* OpenAPI browser */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Endpoint Browser
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={fetchOpenApiSpec}
                          disabled={openApiLoading}
                          className="h-6 text-[10px] px-1.5 gap-1"
                        >
                          {openApiLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          {openApiEndpoints.length > 0
                            ? "Refresh"
                            : "Fetch Spec"}
                        </Button>
                      </div>
                      {openApiEndpoints.length > 0 && (
                        <div className="space-y-1">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              value={endpointFilter}
                              onChange={(e) =>
                                setEndpointFilter(e.target.value)
                              }
                              placeholder="Filter endpoints…"
                              className="h-6 pl-6 text-xs"
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {filteredEndpoints.length} of{" "}
                            {openApiEndpoints.length} endpoints
                          </p>
                          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                            {filteredEndpoints.map((ep, i) => (
                              <button
                                key={i}
                                onClick={() => applyEndpoint(ep)}
                                className="w-full text-left px-1.5 py-1 rounded text-xs flex items-center gap-2 hover:bg-muted/80 transition-colors"
                              >
                                <span
                                  className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${methodBg(ep.method)}`}
                                >
                                  {ep.method}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
                                  {ep.path}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {!openApiEndpoints.length && !openApiLoading && (
                        <p className="text-[10px] text-muted-foreground italic">
                          Click "Fetch Spec" to load endpoints from{" "}
                          {config.serverUrl}/openapi.json
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </Card>

            {/* Right: Response */}
            <Card className="col-span-6 h-full flex flex-col overflow-hidden p-3">
              <div className="flex items-center gap-3 mb-2 flex-shrink-0 flex-wrap">
                {statusCode !== null && (
                  <span
                    className={`text-sm font-bold font-mono ${statusColor(statusCode)}`}
                  >
                    {statusCode} {statusText}
                  </span>
                )}
                {execStatus === "connecting" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
                  </span>
                )}
                {execStatus === "running" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Running…
                  </span>
                )}
                {timing.end && elapsedMs !== null && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                    <Clock className="h-3 w-3" />
                    {(elapsedMs / 1000).toFixed(2)}s
                  </span>
                )}
                {isRunning && timing.start && !timing.end && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {((Date.now() - timing.start) / 1000).toFixed(1)}s…
                  </span>
                )}
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearResponse}
                    disabled={isRunning}
                    className="h-6 w-6 p-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {errorMessage && (
                <div className="flex-shrink-0 mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive font-mono">
                  ❌ {errorMessage}
                </div>
              )}

              <Tabs
                defaultValue="pretty"
                className="flex-1 flex flex-col overflow-hidden min-h-0"
              >
                <TabsList className="grid grid-cols-3 h-8 flex-shrink-0">
                  <TabsTrigger value="pretty" className="text-xs">
                    Pretty JSON
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="text-xs">
                    Raw
                  </TabsTrigger>
                  <TabsTrigger value="resp-headers" className="text-xs">
                    Headers
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="pretty"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  <div className="flex justify-between flex-shrink-0 mb-1">
                    <span className="text-[10px] text-muted-foreground">
                      {responseBody
                        ? `${(responseBody.length / 1024).toFixed(1)} KB`
                        : ""}
                    </span>
                    <CopyButton
                      text={responseBody ? tryPrettyJson(responseBody) : ""}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {!responseBody && !isRunning ? (
                      <p className="text-xs text-muted-foreground">
                        Send a request to see the response here.
                      </p>
                    ) : (
                      <pre className="text-[11px] font-mono whitespace-pre-wrap">
                        {responseBody ? tryPrettyJson(responseBody) : ""}
                      </pre>
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value="raw"
                  className="flex-1 flex flex-col overflow-hidden mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  <div className="flex justify-end flex-shrink-0 mb-1">
                    <CopyButton text={responseBody} />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                      {responseBody || (!isRunning ? "No response yet." : "")}
                    </pre>
                  </div>
                </TabsContent>

                <TabsContent
                  value="resp-headers"
                  className="flex-1 overflow-y-auto mt-2 p-3 bg-muted rounded border min-h-0"
                >
                  {responseHeaders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No response headers yet.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {responseHeaders.map(([k, v]) => (
                        <div
                          key={k}
                          className="flex gap-2 text-[11px] font-mono"
                        >
                          <span className="text-primary font-semibold flex-shrink-0">
                            {k}:
                          </span>
                          <span className="text-foreground/80 break-all">
                            {v}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
