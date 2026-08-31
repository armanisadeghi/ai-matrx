"use client";

// features/mandates/workspace/useMandateWorkspaceData.ts
//
// The ONE data path for the mandate workspace — the single-mandate load both
// hosts (the /mandates/[mandateKey] route and MandateWindow's Yours
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
import { operationFailed } from "@/utils/errors";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import {
  loadFailedFailure,
  noSuchMandateFailure,
  notAnAddressFailure,
  readMandateAddress,
  type MandateLoadFailure,
} from "../mandate-address";
import type { Database } from "@/types/database.types";
import { fetchProvision, type ProvisionOffer } from "../provisions";
import {
  parseBindingWave1,
  parseMandateWave1,
} from "../provision-shapes";
import { parseMandateContract, type MandateContract } from "../contract";
import {
  agentHolderOfBinding,
  contractOfMandate,
  holderOfMandate,
  mandateBindings,
  mandateDefinitions,
} from "@/lib/supabase/mandateStorage";
import type { MandateBindingRow as MandateBindingRowDb, MandateDefinitionRow } from "@/lib/supabase/mandateStorage";

export type MandateRowDb = MandateDefinitionRow;
export type { MandateBindingRowDb };

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
  /**
   * One plain sentence naming what failed. Never PostgREST prose: an RLS code
   * or a schema name is not something a person can act on, and every raw
   * `error.message` here was `check:access-errors`' oldest class of defect.
   * The raw response still travels as `cause` for the Error Inspector.
   */
  error: string | null;
  /**
   * 🚨 WHY it failed, so the screen can offer only controls that can work
   * (V2-6). `error` above stays the sentence for every existing reader; this
   * carries the verdict — a wrong address, a mandate nothing answers to, or a
   * read that genuinely broke. Only the last one is retryable.
   */
  failure: MandateLoadFailure | null;
  refresh: () => void;
}

type MandateAuthClient = Pick<ReturnType<typeof createClient>, "auth">;

/** Establish identity before constructing a protected mandate query. */
export async function requireMandateWorkspaceUser(
  client: MandateAuthClient,
): Promise<string> {
  const { data, error } = await client.auth.getUser();
  const userId = data.user?.id;
  if (error || !userId) {
    throw new Error("Opening a mandate requires an authenticated session.", {
      cause: error ?? undefined,
    });
  }
  return userId;
}

/** A well-formed address nothing answers to — NOT a broken read. */
class MandateNotFound extends Error {
  readonly address: string;
  constructor(address: string) {
    super(`No mandate is registered under "${address}".`);
    this.name = "MandateNotFound";
    this.address = address;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useMandateWorkspaceData(
  mandateKeyOrId: string,
): UseMandateWorkspaceData {
  const [data, setData] = useState<MandateWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<MandateLoadFailure | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);

    // A segment that cannot name a mandate never reaches the database. This
    // is the shortcut routes' rule (FIX-6 item 4) applied to the mandate
    // routes: `/mandates/new` and friends used to be told their mandate had
    // been retired.
    if (readMandateAddress(mandateKeyOrId) === "not-an-address") {
      setData(null);
      setFailure(notAnAddressFailure(mandateKeyOrId));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const supabase = createClient();

      // The route guard may finish before the browser client hydrates. Never
      // let that transient state become an anon read of mandate.definition.
      await requireMandateWorkspaceUser(supabase);

      // 1. The mandate — by uuid (EntityRef doors) or by key (humans, doors).
      const mandateQuery = mandateDefinitions(supabase)
        .select("*")
        .is("deleted_at", null);
      const { data: mandateRows, error: mandateError } = isUuidValue(
        mandateKeyOrId,
      )
        ? await mandateQuery.eq("id", mandateKeyOrId).limit(1)
        : await mandateQuery.eq("mandate_key", mandateKeyOrId).limit(1);
      if (mandateError) throw operationFailed("open this mandate", mandateError);
      const mandate = mandateRows?.[0];
      if (!mandate) throw new MandateNotFound(mandateKeyOrId);

      const wave1 = parseMandateWave1(mandate);

      // 2. Provision + bindings in parallel.
      const [offer, bindingsResult] = await Promise.all([
        wave1.provisionKey ? fetchProvision(wave1.provisionKey) : Promise.resolve(null),
        mandateBindings(supabase)
          .select("*")
          .eq("mandate_id", mandate.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
      ]);
      if (bindingsResult.error)
        throw operationFailed(
          "load the agents bound to this mandate",
          bindingsResult.error,
        );
      const bindings = bindingsResult.data ?? [];

      // 3. Holder identities. Version pins resolve to their master for the
      //    identity read; version_number rides along for drift.
      const systemHolder = holderOfMandate(mandate);
      const bindingHolders = bindings.map((b) => agentHolderOfBinding(b));
      const versionIds = [
        systemHolder.versionId,
        ...bindingHolders.map((h) => h.versionId),
      ].filter((v): v is string => Boolean(v));

      const versionsById: Record<string, WorkspaceVersionInfo> = {};
      if (versionIds.length > 0) {
        const { data: versionRows, error: versionError } = await supabase
          .schema("agent")
          .from("definition_version")
          .select("id, agent_id, version_number")
          .in("id", versionIds);
        if (versionError)
          throw operationFailed(
            "load the agent versions this mandate is pinned to",
            versionError,
          );
        for (const row of versionRows ?? []) {
          versionsById[row.id] = {
            id: row.id,
            agentId: row.agent_id,
            versionNumber: row.version_number ?? null,
          };
        }
      }

      const agentIds = [
        systemHolder.holderId,
        ...bindingHolders.map((h) => h.holderId),
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
        if (agentError)
          throw operationFailed(
            "load the agents behind this mandate",
            agentError,
          );
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
        contract: parseMandateContract(contractOfMandate(mandate)),
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
        setFailure(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure(
          err instanceof MandateNotFound
            ? noSuchMandateFailure(err.address)
            : loadFailedFailure(message(err)),
        );
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

  return { data, loading, error: failure?.message ?? null, failure, refresh };
}
