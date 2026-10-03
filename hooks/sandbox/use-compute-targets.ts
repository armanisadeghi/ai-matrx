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

import { useCallback, useEffect, useRef, useState } from "react";
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
  generation += 1;
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
 * ONE request per refresh, however many pickers are mounted. Every instance
 * listens for window focus, so a page with the chat composer, the sandbox
 * panel and a verified binding fired five or six identical GETs per focus
 * (Vercel, 2026-10-03). Refreshes share the request in flight unless it
 * predates a change: a change notice or an explicit refetch moves
 * `generation`, so the first refresh after it asks again and the rest share
 * that newer request.
 */
let generation = 0;
let inflight: { generation: number; request: Promise<ComputeTargetListResponse> } | null = null;

function loadComputeTargets(): Promise<ComputeTargetListResponse> {
  if (inflight && inflight.generation === generation) return inflight.request;
  const request = (async () => {
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
  })();
  inflight = { generation, request };
  const settled = () => {
    if (inflight?.request === request) inflight = null;
  };
  void request.then(settled, settled);
  return request;
}

export function useComputeTargets(): UseComputeTargetsResult {
  const [data, setData] = useState<ComputeTargetListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const json = await loadComputeTargets();
      if (myId !== fetchIdRef.current) return;
      setData(json);
    } catch (err) {
      if (myId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, []);

  /** An explicit refetch never reuses a request that started before it. */
  const refetch = useCallback(async () => {
    generation += 1;
    await load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener(COMPUTE_TARGETS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(COMPUTE_TARGETS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  return { data, loading, error, refetch };
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
