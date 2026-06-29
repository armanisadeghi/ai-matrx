"use client";

import { useEffect, useState } from "react";
import {
  listAgentBundleOptions,
  type AgentBundleOption,
} from "@/features/tool-registry/bundles/services/bundles.service";

// Module-scoped single-flight cache. The bundle catalogue is small and changes
// rarely, and the tools manager mounts the panel + reads the sidebar count from
// two places — without this they'd each fire the same pair of queries on every
// open. One in-flight promise, shared; resolved value reused for the session.
let cached: AgentBundleOption[] | null = null;
let inFlight: Promise<AgentBundleOption[]> | null = null;

function load(): Promise<AgentBundleOption[]> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = listAgentBundleOptions()
    .then((opts) => {
      cached = opts;
      inFlight = null;
      return opts;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export interface UseAgentBundleOptions {
  bundles: AgentBundleOption[];
  status: "idle" | "loading" | "succeeded" | "error";
  error: string | null;
}

/**
 * Loads the addable bundle catalogue once and shares it across every consumer
 * (the Bundles panel + the sidebar enabled-count). See
 * {@link listAgentBundleOptions} for what counts as "addable".
 */
export function useAgentBundleOptions(): UseAgentBundleOptions {
  const [bundles, setBundles] = useState<AgentBundleOption[]>(cached ?? []);
  // Start in "loading" when there's no cache so the effect never has to set it
  // synchronously (which trips react-hooks/set-state-in-effect).
  const [status, setStatus] = useState<UseAgentBundleOptions["status"]>(
    cached ? "succeeded" : "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return undefined;
    let active = true;
    load()
      .then((opts) => {
        if (!active) return;
        setBundles(opts);
        setStatus("succeeded");
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load bundle options", err);
        setError(err instanceof Error ? err.message : "Failed to load bundles");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return { bundles, status, error };
}
