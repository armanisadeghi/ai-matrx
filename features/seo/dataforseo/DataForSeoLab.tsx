"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import {
  checkSeoHealth,
  createDataForSeoCollection,
  getCollectionEvidence,
  listDataForSeoOperations,
  SeoApiError,
} from "./client";
import type {
  CollectionCreateBody,
  CollectionReceipt,
  DataForSeoOperation,
  JsonValue,
  RunEvidence,
} from "./types";

const SERVER_STORAGE_KEY = "matrx-seo-lab-server";
const DEFAULT_SERVER_URL = "http://127.0.0.1:8081";

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function errorText(error: unknown): string {
  if (error instanceof SeoApiError) {
    return `HTTP ${error.status}\n${pretty(error.detail)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function endpointOptions(
  operation: DataForSeoOperation | undefined,
  workflow: "live" | "standard",
): string[] {
  if (!operation) return [];
  return operation.endpoints.filter((endpoint) => {
    if (endpoint.includes("{task_id}")) return false;
    return workflow === "standard"
      ? endpoint.includes("task_post")
      : !endpoint.includes("task_post");
  });
}

function exampleTask(operationName: string): Record<string, JsonValue> {
  if (operationName.startsWith("serp.")) {
    return {
      keyword: "ai workflow automation",
      location_code: 2840,
      language_code: "en",
      device: "desktop",
      os: "windows",
      depth: 10,
      tag: "matrx-seo-api-lab",
    };
  }
  if (operationName === "keywords.google_ads.search_volume") {
    return {
      keywords: ["ai workflow automation"],
      location_code: 2840,
      language_code: "en",
      tag: "matrx-seo-api-lab",
    };
  }
  if (operationName.includes("keywords_for_site")) {
    return {
      target: "aimatrx.com",
      location_code: 2840,
      language_code: "en",
      limit: 10,
      tag: "matrx-seo-api-lab",
    };
  }
  if (operationName.startsWith("backlinks.")) {
    return { target: "aimatrx.com", limit: 10, tag: "matrx-seo-api-lab" };
  }
  if (operationName.startsWith("on_page.")) {
    return {
      target: "https://aimatrx.com",
      max_crawl_pages: 10,
      tag: "matrx-seo-api-lab",
    };
  }
  if (
    operationName.includes("domain") ||
    operationName.includes("ranked_keywords") ||
    operationName.includes("relevant_pages")
  ) {
    return {
      target: "aimatrx.com",
      location_code: 2840,
      language_code: "en",
      limit: 10,
      tag: "matrx-seo-api-lab",
    };
  }
  return {
    keywords: ["ai workflow automation"],
    location_code: 2840,
    language_code: "en",
    limit: 10,
    tag: "matrx-seo-api-lab",
  };
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs text-foreground">
        {pretty(value)}
      </pre>
    </section>
  );
}

export function DataForSeoLab() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [accessToken, setAccessToken] = useState("");
  const [operations, setOperations] = useState<DataForSeoOperation[]>([]);
  const [operationName, setOperationName] = useState("");
  const [workflow, setWorkflow] = useState<"live" | "standard">("live");
  const [endpoint, setEndpoint] = useState("");
  const [taskJson, setTaskJson] = useState("{}");
  const [targetRef, setTargetRef] = useState("dataforseo-api-lab");
  const [freshRequest, setFreshRequest] = useState(false);
  const [health, setHealth] = useState<JsonValue | null>(null);
  const [receipt, setReceipt] = useState<CollectionReceipt | null>(null);
  const [evidence, setEvidence] = useState<RunEvidence | null>(null);
  const [lastRequest, setLastRequest] = useState<CollectionCreateBody | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const operation = useMemo(
    () => operations.find((item) => item.name === operationName),
    [operationName, operations],
  );
  const endpoints = useMemo(
    () => endpointOptions(operation, workflow),
    [operation, workflow],
  );

  useEffect(() => {
    void createClient()
      .auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        setAccessToken(data.session?.access_token ?? "");
      })
      .catch((sessionError: unknown) => setError(errorText(sessionError)));
  }, []);

  const loadOperations = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      const [healthPayload, catalog] = await Promise.all([
        checkSeoHealth(serverUrl),
        listDataForSeoOperations(serverUrl, accessToken),
      ]);
      setHealth(healthPayload);
      setOperations(catalog.operations);
      if (!operationName && catalog.operations[0]) {
        const first = catalog.operations[0];
        const firstWorkflow = first.workflows[0] ?? "live";
        const firstEndpoints = endpointOptions(first, firstWorkflow);
        setOperationName(first.name);
        setWorkflow(firstWorkflow);
        setEndpoint(firstEndpoints.length === 1 ? firstEndpoints[0] : "");
        setTaskJson(pretty(exampleTask(first.name)));
      }
      localStorage.setItem(SERVER_STORAGE_KEY, serverUrl);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setBusy(false);
    }
  }, [accessToken, operationName, serverUrl]);

  const selectOperation = (name: string) => {
    const next = operations.find((item) => item.name === name);
    setOperationName(name);
    if (!next) return;
    const nextWorkflow = next.workflows.includes(workflow)
      ? workflow
      : next.workflows[0] ?? "live";
    const nextEndpoints = endpointOptions(next, nextWorkflow);
    setWorkflow(nextWorkflow);
    setEndpoint(nextEndpoints.length === 1 ? nextEndpoints[0] : "");
    setTaskJson(pretty(exampleTask(next.name)));
  };

  const selectWorkflow = (nextWorkflow: "live" | "standard") => {
    setWorkflow(nextWorkflow);
    const nextEndpoints = endpointOptions(operation, nextWorkflow);
    setEndpoint(nextEndpoints.length === 1 ? nextEndpoints[0] : "");
  };

  const run = async () => {
    if (!organizationId) {
      setError("No active or personal organization is available in Redux.");
      return;
    }
    if (!accessToken) {
      setError("Sign in to AI Matrx before using the SEO API lab.");
      return;
    }
    if (!operation) {
      setError("Select a DataForSEO operation.");
      return;
    }
    if (endpoints.length > 1 && !endpoint) {
      setError("This operation has multiple approved endpoints. Select the exact endpoint.");
      return;
    }
    let task: Record<string, JsonValue>;
    try {
      const parsed: unknown = JSON.parse(taskJson);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Task JSON must be one object. The API wraps it in the task array.");
      }
      task = parsed as Record<string, JsonValue>;
    } catch (parseError) {
      setError(errorText(parseError));
      return;
    }

    const now = new Date();
    const body: CollectionCreateBody = {
      provider: "dataforseo",
      organization_id: organizationId,
      capability: "raw_provider",
      operation: operation.name,
      target_ref: targetRef.trim() || "dataforseo-api-lab",
      observation_period: now.toISOString().slice(0, 10),
      settings: {
        tasks: [task],
        workflow,
        ...(endpoint ? { endpoint } : {}),
      },
      request_id: crypto.randomUUID(),
      force_refresh: freshRequest,
    };

    setBusy(true);
    setError("");
    setReceipt(null);
    setEvidence(null);
    setLastRequest(body);
    try {
      const nextReceipt = await createDataForSeoCollection(
        serverUrl,
        accessToken,
        body,
      );
      setReceipt(nextReceipt);
      setEvidence(
        await getCollectionEvidence(serverUrl, accessToken, nextReceipt.run_id),
      );
    } catch (runError) {
      setError(errorText(runError));
      if (
        runError instanceof SeoApiError &&
        runError.detail &&
        typeof runError.detail === "object" &&
        !Array.isArray(runError.detail) &&
        typeof runError.detail.run_id === "string"
      ) {
        try {
          setEvidence(
            await getCollectionEvidence(
              serverUrl,
              accessToken,
              runError.detail.run_id,
            ),
          );
        } catch (evidenceError) {
          setError(
            `${errorText(runError)}\n\nEvidence lookup also failed:\n${errorText(evidenceError)}`,
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const providerRequests = evidence?.provider_calls.flatMap((call) => {
    const requests = call.metadata.requests;
    return Array.isArray(requests) ? requests : [];
  });
  const providerResponses = evidence?.raw_payloads.map((payload) => payload.payload);

  return (
    <div className="h-full overflow-auto bg-textured p-3 text-foreground sm:p-4">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">DataForSEO API Lab</h1>
            <p className="text-xs text-muted-foreground">
              Every approved operation, exact task input, durable run, and full provider JSON.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-4 w-4" />
            {operations.length} operations
            {health ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
          </div>
        </header>

        <section className="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[1fr_auto]">
          <label className="min-w-0 text-xs text-muted-foreground">
            matrx-seo server
            <input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={busy || !accessToken}
            onClick={() => void loadOperations()}
            className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Server className="h-4 w-4" />
            Connect
          </button>
        </section>

        {!accessToken ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Sign in to AI Matrx to use your Supabase session with the SEO server.
          </div>
        ) : null}
        {error ? (
          <pre className="whitespace-pre-wrap rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </pre>
        ) : null}

        <section className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-muted-foreground xl:col-span-2">
            Operation
            <select
              value={operationName}
              onChange={(event) => selectOperation(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {operations.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.family} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Workflow
            <select
              value={workflow}
              onChange={(event) =>
                selectWorkflow(event.target.value as "live" | "standard")
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {(operation?.workflows ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Cache identity target
            <input
              value={targetRef}
              onChange={(event) => setTargetRef(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground xl:col-span-4">
            Exact endpoint
            <select
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
            >
              {endpoints.length > 1 ? <option value="">Select an endpoint</option> : null}
              {endpoints.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground xl:col-span-4">
            DataForSEO task object
            <textarea
              value={taskJson}
              onChange={(event) => setTaskJson(event.target.value)}
              spellCheck={false}
              className="mt-1 min-h-64 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 xl:col-span-4">
            <button
              type="button"
              disabled={busy || !operation || !accessToken}
              onClick={() => void run()}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run and persist
            </button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={freshRequest}
                onChange={(event) => setFreshRequest(event.target.checked)}
              />
              Force fresh provider call (bypass server TTL)
            </label>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              This can spend provider credits.
            </span>
          </div>
        </section>

        {receipt ? (
          <section className="grid gap-2 rounded-lg border border-border bg-card p-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div><span className="text-muted-foreground">Run</span><div className="truncate font-mono">{receipt.run_id}</div></div>
            <div><span className="text-muted-foreground">Cache</span><div>{receipt.from_cache ? `hit · ${receipt.cache_age_seconds ?? 0}s old` : "provider executed"}</div></div>
            <div><span className="text-muted-foreground">Created facts</span><div>{receipt.created_observations}</div></div>
            <div><span className="text-muted-foreground">Existing facts</span><div>{receipt.existing_observations}</div></div>
            <div><span className="text-muted-foreground">Raw payload</span><div className="truncate font-mono">{receipt.raw_payload_id ?? "none"}</div></div>
          </section>
        ) : null}

        {lastRequest && isSuperAdmin ? (
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            <JsonPanel title="Exact request to matrx-seo" value={lastRequest} />
            <JsonPanel title="Persisted collection request" value={evidence?.request ?? null} />
            <JsonPanel title="Literal outbound provider request(s), auth redacted" value={providerRequests ?? null} />
            <JsonPanel title="Exact full provider response(s)" value={providerResponses ?? null} />
            <div className="xl:col-span-2">
              <JsonPanel title="Complete persisted evidence" value={evidence} />
            </div>
          </div>
        ) : null}

        {lastRequest && !isSuperAdmin ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            Exact raw request and response panels are visible to super admins only.
          </div>
        ) : null}

        <footer className="flex items-center gap-2 pb-4 text-xs text-muted-foreground">
          <TerminalSquare className="h-4 w-4" />
          Local server: <code>cd aidream &amp;&amp; ./packages/matrx-seo/scripts/run_local.sh</code>
        </footer>
      </div>
    </div>
  );
}
