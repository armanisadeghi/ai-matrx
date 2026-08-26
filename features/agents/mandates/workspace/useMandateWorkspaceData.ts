"use client";

// features/agents/mandates/workspace/useMandateWorkspaceData.ts
//
// The ONE data path for the mandate workspace — the single-mandate load both
// hosts (the /agents/mandates/[mandateKey] route and MandateWindow's Yours
// pane) share, so route and window can never drift (Arman's rule 3).
//
// Loads, targeted (never the whole registry):
//   · the mandate row (accepts the KEY or the row UUID — generic EntityRef
//     doors pass uuids, humans share keys)
//   · its Provision offer (fetchProvision, cached)
//   · every binding on it the caller's RLS can see (theirs + their orgs')
//   · the holder agents behind default/user/org layers (by-id reads — legal
//     under the canonical-selection law) with `version` for drift
//   · pinned definition_version rows (version_number) for drift strings
//
// Refresh is THIS mandate only — a save must never refetch a 366-row page
// (the old page's onChanged did exactly that).

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import type { Database } from "@/types/database.types";
import { fetchProvision, type ProvisionOffer } from "../provisions";
import {
  parseBindingWave1,
  parseMandateWave1,
} from "../provision-shapes";
import { parseMandateContract, type MandateContract } from "../contract";

export type MandateRowDb = Database["agent"]["Tables"]["mandate"]["Row"];
export type MandateBindingRowDb =
  Database["agent"]["Tables"]["mandate_binding"]["Row"];

export interface WorkspaceAgentInfo {
  id: string;
  name: string;
  agentType: string | null;
  isArchived: boolean;
  /** The master's latest version number (drift comparisons). */
  latestVersion: number | null;
}

export interface WorkspaceVersionInfo {
  id: string;
  agentId: string;
  versionNumber: number | null;
}

export interface MandateWorkspaceData {
  mandate: MandateRowDb;
  contract: MandateContract;
  provisionKey: string | null;
  pins: ReturnType<typeof parseMandateWave1>["pins"];
  pinnedContext: string[];
  offer: ProvisionOffer | null;
  /** Caller-visible bindings on this mandate (user's own + their orgs'). */
  bindings: MandateBindingRowDb[];
  agentsById: Record<string, WorkspaceAgentInfo>;
  versionsById: Record<string, WorkspaceVersionInfo>;
}

export interface UseMandateWorkspaceData {
  data: MandateWorkspaceData | null;
  loading: boolean;
  /** Loud, verbatim — never softened. */
  error: string | null;
  refresh: () => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useMandateWorkspaceData(
  mandateKeyOrId: string,
): UseMandateWorkspaceData {
  const [data, setData] = useState<MandateWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const supabase = createClient();

      // 1. The mandate — by uuid (EntityRef doors) or by key (humans, doors).
      const mandateQuery = supabase
        .schema("agent")
        .from("mandate")
        .select("*")
        .is("deleted_at", null);
      const { data: mandateRows, error: mandateError } = isUuidValue(
        mandateKeyOrId,
      )
        ? await mandateQuery.eq("id", mandateKeyOrId).limit(1)
        : await mandateQuery.eq("mandate_key", mandateKeyOrId).limit(1);
      if (mandateError) throw new Error(mandateError.message);
      const mandate = mandateRows?.[0];
      if (!mandate) {
        throw new Error(
          `No mandate "${mandateKeyOrId}" — it may have been retired, or the link is stale.`,
        );
      }

      const wave1 = parseMandateWave1(mandate);

      // 2. Provision + bindings in parallel.
      const [offer, bindingsResult] = await Promise.all([
        wave1.provisionKey ? fetchProvision(wave1.provisionKey) : Promise.resolve(null),
        supabase
          .schema("agent")
          .from("mandate_binding")
          .select("*")
          .eq("mandate_id", mandate.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
      ]);
      if (bindingsResult.error) throw new Error(bindingsResult.error.message);
      const bindings = bindingsResult.data ?? [];

      // 3. Holder identities. Version pins resolve to their master for the
      //    identity read; version_number rides along for drift.
      const versionIds = [
        mandate.default_agent_version_id,
        ...bindings.map((b) => b.agent_version_id),
      ].filter((v): v is string => Boolean(v));

      const versionsById: Record<string, WorkspaceVersionInfo> = {};
      if (versionIds.length > 0) {
        const { data: versionRows, error: versionError } = await supabase
          .schema("agent")
          .from("definition_version")
          .select("id, agent_id, version_number")
          .in("id", versionIds);
        if (versionError) throw new Error(versionError.message);
        for (const row of versionRows ?? []) {
          versionsById[row.id] = {
            id: row.id,
            agentId: row.agent_id,
            versionNumber: row.version_number ?? null,
          };
        }
      }

      const agentIds = [
        mandate.default_agent_id,
        ...bindings.map((b) => b.agent_id),
        ...Object.values(versionsById).map((v) => v.agentId),
      ].filter((v): v is string => Boolean(v));

      const agentsById: Record<string, WorkspaceAgentInfo> = {};
      if (agentIds.length > 0) {
        // By-id read — explicitly legal under the canonical-selection law.
        const { data: agentRows, error: agentError } = await supabase
          .schema("agent")
          .from("definition")
          .select("id, name, agent_type, is_archived, version")
          .in("id", [...new Set(agentIds)]);
        if (agentError) throw new Error(agentError.message);
        for (const row of agentRows ?? []) {
          agentsById[row.id] = {
            id: row.id,
            name: row.name,
            agentType: row.agent_type,
            isArchived: row.is_archived === true,
            latestVersion: row.version ?? null,
          };
        }
      }

      return {
        mandate,
        contract: parseMandateContract(mandate.contract),
        provisionKey: wave1.provisionKey,
        pins: wave1.pins,
        pinnedContext: wave1.pinnedContext,
        offer,
        bindings,
        agentsById,
        versionsById,
      } satisfies MandateWorkspaceData;
    })()
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(message(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mandateKeyOrId, generation]);

  // The parsed binding halves, memo'd once for every consumer section.
  const parsed = useMemo(() => {
    if (!data) return null;
    return data.bindings.map((b) => ({
      row: b,
      wave1: parseBindingWave1(b),
    }));
  }, [data]);
  void parsed;

  return { data, loading, error, refresh };
}
