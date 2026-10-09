"use client";

/**
 * useComputeTargets — fetch the user's bindable compute targets (sandboxes
 * + local PCs) from `/api/compute-targets`. Single fetch for the unified
 * SandboxPanel picker; replaces the sandbox-only `useSandboxInstances` for
 * the binding UX (the admin sandbox-management page still uses the old hook).
 *
 * Server-side resolution into the full sandbox-binding payload (orchestrator
 * token for sandboxes; aidream-proxy URL + Supabase JWT for local PCs)
 * lives at `/api/compute-targets/resolve`. See `lib/sandbox/active-binding.ts`
 * for the read-side that consumes the resolved payload on every chat turn.
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { ensureStoreRead } from "@/lib/redux/slices/storeReadsSlice";
import { getUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";

import type {
  ComputeTargetListResponse,
  ComputeTarget,
} from "@/app/api/compute-targets/route";

export type { ComputeTarget, ComputeTargetListResponse };

const COMPUTE_TARGETS_CHANGED = "matrx:compute-targets-changed";

/** Refresh mounted pickers after a successful sandbox mutation. */
export function notifyComputeTargetsChanged(): void {
  window.dispatchEvent(new Event(COMPUTE_TARGETS_CHANGED));
}

export interface ComputeTargetRef {
  rowId: string;
  kind: "ec2" | "hosted" | "local-pc";
  /** Display name latched at selection so the picker chip renders without re-fetching. */
  name: string;
}

interface UseComputeTargetsResult {
  data: ComputeTargetListResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * The list lives in Redux (`useStoreRead`, key `sandbox.compute-targets`): the
 * first picker reads it, every other picker and every remount or wake renders
 * the stored list and reads nothing. A change notice re-reads (queued behind a
 * read already running, which may predate the change); a window focus re-reads
 * once however many pickers are mounted (it joins a read already running).
 */
const COMPUTE_TARGETS_KEY = "sandbox.compute-targets";

async function loadComputeTargets(): Promise<ComputeTargetListResponse> {
  // Signed out: nobody owns a compute target — an empty list, never a
  // request the route refuses with 401. The session read covers the boot
  // race where the store has no id yet.
  if (!getUserId()) {
    const { data } = await supabase.auth
      .getSession()
      .catch(() => ({ data: { session: null } }));
    if (!data.session) return { targets: [], max_sandboxes: 0, sandbox_count: 0 };
  }
  const resp = await fetch("/api/compute-targets");
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(body || `HTTP ${resp.status}`);
  }
  return (await resp.json()) as ComputeTargetListResponse;
}

/**
 * `enabled: false` reads nothing and listens to nothing — a caller that only
 * needs the list once something is bound (`useVerifiedSandboxBinding`) passes
 * it, so an idle composer with no box never asks `/api/compute-targets`.
 */
export function useComputeTargets(options?: { enabled?: boolean }): UseComputeTargetsResult {
  const enabled = options?.enabled !== false;
  const dispatch = useAppDispatch();
  const read = useStoreRead<ComputeTargetListResponse>(COMPUTE_TARGETS_KEY, loadComputeTargets, { enabled });

  useEffect(() => {
    if (!enabled) return undefined;
    const onChange = () => {
      void dispatch(ensureStoreRead(COMPUTE_TARGETS_KEY, loadComputeTargets, { force: true }));
    };
    const onFocus = () => {
      void dispatch(ensureStoreRead(COMPUTE_TARGETS_KEY, loadComputeTargets, { force: true, joinRunning: true }));
    };
    window.addEventListener(COMPUTE_TARGETS_CHANGED, onChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(COMPUTE_TARGETS_CHANGED, onChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [dispatch, enabled]);

  return {
    data: read.data ?? null,
    loading: read.isLoading,
    error: read.error,
    /** An explicit refetch never reuses a request that started before it. */
    refetch: read.refresh,
  };
}

export interface SandboxBindingPayload {
  sandbox_id: string;
  base_url: string;
  access_token: string;
  root_path: string;
}

/**
 * Resolve a compute-target ref into the full sandbox-binding payload the
 * chat backend consumes. Called once per chat turn (in
 * `lib/sandbox/active-binding.ts::getActiveSandboxBinding`) — orchestrator
 * tokens are short-lived, tunnels can drop offline. Returns `null` on
 * any failure; the agent then runs unbound for the turn.
 */
export async function resolveComputeTarget(
  ref: ComputeTargetRef,
): Promise<SandboxBindingPayload | null> {
  try {
    const resp = await fetch("/api/compute-targets/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: ref.kind, id: ref.rowId }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as SandboxBindingPayload;
  } catch {
    return null;
  }
}
