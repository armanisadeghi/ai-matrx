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

import type {
  ComputeTargetListResponse,
  ComputeTarget,
} from "@/app/api/compute-targets/route";

export type { ComputeTarget, ComputeTargetListResponse };

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

export function useComputeTargets(): UseComputeTargetsResult {
  const [data, setData] = useState<ComputeTargetListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const refetch = useCallback(async () => {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/compute-targets");
      if (myId !== fetchIdRef.current) return;
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(body || `HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as ComputeTargetListResponse;
      if (myId !== fetchIdRef.current) return;
      setData(json);
    } catch (err) {
      if (myId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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
