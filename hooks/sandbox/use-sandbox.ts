"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SandboxInstance,
  SandboxListResponse,
  SandboxDetailResponse,
  SandboxCreateRequest,
  SandboxActionRequest,
  SandboxExecRequest,
  SandboxExecResponse,
  SandboxAccessResponse,
} from "@/types/sandbox";
import { notifyComputeTargetsChanged } from "./use-compute-targets";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { requireMatchingSandboxOrganization } from "@/lib/sandbox/explicit-organization";
import { requestSandboxExtension } from "@/lib/sandbox/extension-response";
import { useSandboxLifecycleSubmission } from "@/lib/sandbox/useSandboxLifecycleSubmission";
import { useSandboxLifecycleTerminalInvalidation } from "@/lib/sandbox/useSandboxLifecycleTerminalInvalidation";

/** The sandbox list's page size is the `infrastructure.sandbox list_page_size` knob. */
const SANDBOX_KNOB_FEATURE = "infrastructure.sandbox";

type SandboxListOptions = {
  status?: string;
  limit?: number;
  offset?: number;
};

/**
 * Shared error extractor for sandbox API responses. Surfaces the underlying
 * orchestrator response (`details`) alongside the route's `error` headline so
 * the UI shows actionable reasons (e.g. "Invalid API key", connection refused)
 * instead of a generic "Failed to …" message that hides the real cause.
 */
async function extractSandboxError(
  resp: Response,
  fallback: string,
): Promise<string> {
  let body: { error?: string; details?: unknown } = {};
  try {
    body = (await resp.json()) as { error?: string; details?: unknown };
  } catch {
    // Empty / non-JSON body — fall through to the fallback.
  }
  const headline = body.error || fallback;
  if (
    body.details === undefined ||
    body.details === null ||
    body.details === ""
  ) {
    return headline;
  }
  const detailsText =
    typeof body.details === "string"
      ? body.details
      : JSON.stringify(body.details);
  return `${headline} — ${detailsText}`;
}

export function useSandboxInstances(projectId?: string) {
  const organizationId = useAppSelector(selectOrganizationId);
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const [instances, setInstances] = useState<SandboxInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const hasFetchedOnce = useRef(false);
  const [listProjectId, setListProjectId] = useState(projectId);
  const listProjectIdRef = useRef(projectId);
  const listRequestId = useRef(0);
  const listScopeGeneration = useRef(0);
  const listAbortController = useRef<AbortController | null>(null);
  const extensionGeneration = useRef(0);
  const extensionIdentity = useRef("");
  const pendingExtensions = useRef(new Map<string, number>());
  const { submit: submitLifecycle } = useSandboxLifecycleSubmission();

  const currentExtensionIdentity = `${authReady}:${userId ?? ""}:${organizationId ?? ""}`;

  useEffect(() => {
    listScopeGeneration.current += 1;
    listRequestId.current += 1;
    listAbortController.current?.abort();
    extensionIdentity.current = currentExtensionIdentity;
    extensionGeneration.current += 1;
    return () => {
      extensionGeneration.current += 1;
    };
  }, [currentExtensionIdentity, projectId]);

  useEffect(() => {
    return () => {
      listRequestId.current += 1;
      listAbortController.current?.abort();
      listAbortController.current = null;
    };
  }, [authReady, organizationId, projectId, userId]);

  const fetchInstances = useCallback(
    async (opts?: SandboxListOptions) => {
      const scopeGeneration = listScopeGeneration.current;
      const requestId = listRequestId.current + 1;
      listRequestId.current = requestId;
      listAbortController.current?.abort();
      const abortController = new AbortController();
      listAbortController.current = abortController;

      // Only show full loading state on initial fetch
      if (!hasFetchedOnce.current) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const fetchPage = async (limit: number, offset: number) => {
          const params = new URLSearchParams();
          if (projectId) params.set("project_id", projectId);
          if (opts?.status) params.set("status", opts.status);
          params.set("limit", String(limit));
          params.set("offset", String(offset));

          const resp = await fetch(`/api/sandbox?${params}`, {
            signal: abortController.signal,
          });
          if (!resp.ok) {
            throw new Error(
              await extractSandboxError(resp, "Failed to fetch instances"),
            );
          }
          const page: SandboxListResponse = await resp.json();
          return page;
        };

        const hasExplicitPage =
          opts?.limit !== undefined || opts?.offset !== undefined;
        let data: SandboxListResponse;
        const pageSize = await knobInt(SANDBOX_KNOB_FEATURE, "list_page_size");

        if (hasExplicitPage) {
          data = await fetchPage(opts?.limit ?? pageSize, opts?.offset ?? 0);
        } else {
          const instances: SandboxInstance[] = [];
          let offset = 0;
          let total = 0;
          let hasMore = true;

          while (hasMore) {
            const page = await fetchPage(pageSize, offset);
            if (listRequestId.current !== requestId || listScopeGeneration.current !== scopeGeneration) return null;

            instances.push(...page.instances);
            total = page.pagination.total;
            hasMore = page.pagination.hasMore;

            if (hasMore && page.instances.length === 0) {
              throw new Error(
                "Sandbox list reported another page but returned no rows.",
              );
            }
            if (page.pagination.limit <= 0) {
              throw new Error(
                "Sandbox list returned an invalid page size while more rows remain.",
              );
            }
            offset += page.pagination.limit;
          }

          data = {
            instances,
            pagination: {
              total,
              limit: pageSize,
              offset: 0,
              hasMore: false,
            },
          };
        }

        if (listRequestId.current !== requestId || listScopeGeneration.current !== scopeGeneration) return null;

        // Deduplicate by immutable database ID while preserving the server's
        // descending-created-at sequence across every fetched page.
        const uniqueInstances = Array.from(
          new Map(data.instances.map((inst) => [inst.id, inst])).values(),
        );

        if (
          !hasExplicitPage &&
          uniqueInstances.length !== data.pagination.total
        ) {
          throw new Error(
            "Sandbox list changed while loading; refresh to load a complete list.",
          );
        }

        console.log("[useSandboxInstances] fetchInstances:", {
          received: data.instances.length,
          unique: uniqueInstances.length,
          duplicates: data.instances.length - uniqueInstances.length,
          ids: uniqueInstances.map((i) => i.id),
        });

        if (listScopeGeneration.current !== scopeGeneration) return null;
        setInstances(uniqueInstances);
        setTotal(data.pagination.total);
        hasFetchedOnce.current = true;
        listProjectIdRef.current = projectId;
        setListProjectId(projectId);
        return { ...data, instances: uniqueInstances };
      } catch (err) {
        if (listRequestId.current !== requestId || listScopeGeneration.current !== scopeGeneration) return null;
        if (err instanceof DOMException && err.name === "AbortError") {
          return null;
        }
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (listProjectIdRef.current !== projectId) {
          setInstances([]);
          setTotal(0);
          listProjectIdRef.current = projectId;
          setListProjectId(projectId);
        }
        setError(msg);
        return null;
      } finally {
        if (listRequestId.current === requestId && listScopeGeneration.current === scopeGeneration) {
          setLoading(false);
          setRefreshing(false);
          if (listAbortController.current === abortController) {
            listAbortController.current = null;
          }
        }
      }
    },
    [authReady, organizationId, projectId, userId],
  );
  useSandboxLifecycleTerminalInvalidation(() => fetchInstances());

  const showingCurrentProject = listProjectId === projectId;

  const createInstance = useCallback(
    async (
      req: SandboxCreateRequest,
    ): Promise<{ instance: SandboxInstance | null; error: string | null }> => {
      setError(null);
      try {
        const explicitOrganizationId = requireMatchingSandboxOrganization(
          req.organization_id,
          organizationId,
        );
        console.log(
          "[useSandboxInstances] createInstance: Starting creation request",
        );

        // Forward every field the API accepts. The earlier truncated body
        // silently dropped `tier`, `template`, `template_version`, `resources`,
        // and `labels`, which made the `/sandbox` page incapable of creating
        // anything but the default-tier sandbox even after we added a tier
        // picker to it. Keep this in lockstep with `SandboxCreateRequest` and
        // the POST handler in `app/api/sandbox/route.ts`.
        const resp = await fetch("/api/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organization_id: explicitOrganizationId,
            project_id: req.project_id || projectId,
            config: req.config,
            ttl_seconds: req.ttl_seconds,
            tier: req.tier,
            template: req.template,
            template_version: req.template_version,
            resources: req.resources,
            labels: req.labels,
          }),
        });

        if (!resp.ok) {
          const message = await extractSandboxError(
            resp,
            "Failed to create sandbox",
          );
          console.error(
            "[useSandboxInstances] createInstance: HTTP error",
            resp.status,
            message,
          );
          throw new Error(message);
        }

        const { instance }: SandboxDetailResponse = await resp.json();

        console.log("[useSandboxInstances] createInstance: Success", {
          id: instance.id,
          sandbox_id: instance.sandbox_id,
          status: instance.status,
        });

        // Optimistically add to state, but deduplicate in case of race condition
        setInstances((prev) => {
          const exists = prev.some((i) => i.id === instance.id);
          if (exists) {
            console.warn(
              "[useSandboxInstances] createInstance: Instance already exists in state, skipping add",
            );
            return prev;
          }
          return [instance, ...prev];
        });
        setTotal((prev) => prev + 1);
        return { instance, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[useSandboxInstances] createInstance: Error", msg);
        setError(msg);
        return { instance: null, error: msg };
      }
    },
    [organizationId, projectId],
  );

  const stopInstance = useCallback(async (id: string) => {
    setError(null);
    const instance = instances.find((candidate) => candidate.id === id);
    if (!instance) return null;
    const result = await submitLifecycle({ rowId: id, sandboxId: instance.sandbox_id, kind: "stop" });
    if (!result.admitted) { setError(result.reason === "already_pending" ? "A sandbox operation is already pending for this target." : "Sandbox lifecycle is still connecting to your account."); return null; }
    return "queued" as const;
  }, [instances, submitLifecycle]);

  const renameInstance = useCallback(async (id: string, name: string) => {
    setError(null);
    try {
      const resp = await fetch(`/api/sandbox/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!resp.ok) {
        throw new Error(
          await extractSandboxError(resp, "Failed to rename sandbox"),
        );
      }
      const { instance }: SandboxDetailResponse = await resp.json();
      setInstances((prev) => prev.map((i) => (i.id === id ? instance : i)));
      notifyComputeTargetsChanged();
      return instance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      return null;
    }
  }, []);

  const extendInstance = useCallback(
    async (id: string, additionalSeconds = 3600) => {
      const requestGeneration = extensionGeneration.current;
      const requestIdentity = extensionIdentity.current;
      if (pendingExtensions.current.get(id) === requestGeneration) return null;
      pendingExtensions.current.set(id, requestGeneration);

      const isCurrent = () =>
        extensionGeneration.current === requestGeneration &&
        extensionIdentity.current === requestIdentity;

      if (isCurrent()) setError(null);
      try {
        const result = await requestSandboxExtension(id, additionalSeconds);
        if (!isCurrent()) return null;
        if (result.kind === "success") {
          setInstances((prev) =>
            prev.map((instance) =>
              instance.id === id ? result.instance : instance,
            ),
          );
          return result.instance;
        }
        setError(result.message);
        return null;
      } finally {
        if (pendingExtensions.current.get(id) === requestGeneration) {
          pendingExtensions.current.delete(id);
        }
      }
    },
    [],
  );

  const deleteInstance = useCallback(async (id: string) => {
    setError(null);
    const instance = instances.find((candidate) => candidate.id === id);
    if (!instance) return null;
    const result = await submitLifecycle({ rowId: id, sandboxId: instance.sandbox_id, kind: "delete" });
    if (!result.admitted) { setError(result.reason === "already_pending" ? "A sandbox operation is already pending for this target." : "Sandbox lifecycle is still connecting to your account."); return null; }
    return "queued" as const;
  }, [instances, submitLifecycle]);

  const deleteInstances = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return {
        deletedIds: [] as string[],
        failed: [] as string[],
        unknownIds: [] as string[],
      };
    }

    setError(null);
    const results = await Promise.all(
      ids.map(async (id) => {
        const instance = instances.find((candidate) => candidate.id === id);
        if (!instance) return { id, ok: false as const };
        const result = await submitLifecycle({ rowId: id, sandboxId: instance.sandbox_id, kind: "delete" });
        return result.admitted ? { id, queued: true as const } : { id, ok: false as const };
      }),
    );
    const queuedIds = results.filter((r) => "queued" in r).map((r) => r.id);
    const failed = results
      .filter((r) => "ok" in r && r.ok === false)
      .map((r) => r.id);
    const unknownIds: string[] = [];

    if (failed.length > 0) {
      setError(
        failed.length === ids.length
          ? "Failed to delete sandbox history"
          : `${queuedIds.length} deletion request(s) queued, but ${failed.length} could not be requested`,
      );
    }

    return { queuedIds, deletedIds: [] as string[], failed, unknownIds };
  }, [instances, submitLifecycle]);

  const execCommand = useCallback(
    async (
      id: string,
      req: SandboxExecRequest,
    ): Promise<SandboxExecResponse | null> => {
      setError(null);
      try {
        const resp = await fetch(`/api/sandbox/${id}/exec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });

        if (!resp.ok) {
          throw new Error(
            await extractSandboxError(resp, "Command execution failed"),
          );
        }

        return (await resp.json()) as SandboxExecResponse;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        return null;
      }
    },
    [],
  );

  const requestAccess = useCallback(
    async (id: string): Promise<SandboxAccessResponse | null> => {
      setError(null);
      try {
        const resp = await fetch(`/api/sandbox/${id}/access`, {
          method: "POST",
        });

        if (!resp.ok) {
          throw new Error(
            await extractSandboxError(resp, "Failed to request SSH access"),
          );
        }

        return (await resp.json()) as SandboxAccessResponse;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        return null;
      }
    },
    [],
  );

  return {
    instances: showingCurrentProject ? instances : [],
    loading: showingCurrentProject ? loading : true,
    refreshing: showingCurrentProject ? refreshing : false,
    error: showingCurrentProject ? error : null,
    total: showingCurrentProject ? total : 0,
    fetchInstances,
    createInstance,
    renameInstance,
    stopInstance,
    extendInstance,
    deleteInstance,
    deleteInstances,
    execCommand,
    requestAccess,
  };
}
