"use client";

// features/mandates/feature-intelligence/useIntelligenceDirectory.ts
//
// THE ONE INDEX every Intelligence page searches: every job's definition (one
// read) and, once the organization is settled, what runs each job from this
// seat (one read per lane). The /intelligence directory renders it; every
// feature page's search reads the same index for "Everywhere else". Kept in a
// module cache for the session so moving between Intelligence pages searches
// instantly; a binding write anywhere refreshes the holders.

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import {
  callMandateMemberList,
  memberRowFromWire,
  type MandateMemberPageAnswer,
} from "../member-list/rpc";
import { onMandateCacheInvalidated } from "../service";
import { lanesFor } from "./service";
import {
  buildDomains,
  type DirectoryDefinition,
  type DirectoryDomain,
  type DirectoryHolder,
} from "./index-model";

export type DirectoryDefRow = DirectoryDefinition & {
  organization_id: string | null;
  created_by: string | null;
};

let defsCache: Promise<DirectoryDefRow[]> | null = null;
const holdersCache = new Map<string, Promise<DirectoryHolder[]>>();

function readDefinitions(): Promise<DirectoryDefRow[]> {
  defsCache ??= readAllRows(
    ({ from, to }) =>
      mandateDefinitions(createClient())
        .select("mandate_key, label, description, goal, organization_id, created_by", {
          count: "exact",
        })
        .is("deleted_at", null)
        .order("mandate_key", { ascending: true })
        .range(from, to),
    { label: "mandate definitions for the intelligence index" },
  ).catch((cause: unknown) => {
    defsCache = null;
    throw cause;
  });
  return defsCache;
}

/** Every job's holder from this seat, in one read per lane the jobs live in. */
async function fetchHolders(
  defs: readonly DirectoryDefRow[],
  organizationId: string | null,
  userId: string | null,
): Promise<DirectoryHolder[]> {
  const systemOrgId = await resolveSystemOrgId();
  const lanes = lanesFor(defs, systemOrgId, userId, "person");
  const answers = await Promise.all(
    lanes.map((scope) =>
      callMandateMemberList<MandateMemberPageAnswer>({
        p_mode: "page",
        p_level: "person",
        p_scope: scope,
        p_resolve_org_id: organizationId ?? undefined,
        p_sort: "name",
        p_dir: "asc",
        p_limit: 5000,
        p_offset: 0,
      }),
    ),
  );
  return answers.flatMap((answer) =>
    answer.rows.map(memberRowFromWire).map((row) => ({
      mandateKey: row.mandateKey,
      holderName: row.holderName,
      holderType: row.holderType,
      status: row.status,
    })),
  );
}

onMandateCacheInvalidated(() => holdersCache.clear());

export interface IntelligenceDirectoryState {
  domains: DirectoryDomain[] | null;
  defs: DirectoryDefRow[] | null;
  error: string | null;
}

export function useIntelligenceDirectory(): IntelligenceDirectoryState {
  const [defs, setDefs] = useState<DirectoryDefRow[] | null>(null);
  const [holders, setHolders] = useState<DirectoryHolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const userId = useAppSelector(selectUserId);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const { organizationState } = useOrganizationRequired();

  useEffect(() => onMandateCacheInvalidated(() => setEpoch((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    readDefinitions().then(
      (rows) => {
        if (!cancelled) setDefs(rows);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // What runs each job, from this seat — read after the cards are up, and only
  // once the organization is settled (a read with no org is thrown away). A
  // failed read leaves the index without its agent/workflow names; search
  // still finds jobs, places and names.
  useEffect(() => {
    if (!defs || organizationState === "resolving") return;
    let cancelled = false;
    const key = `${activeOrgId ?? ""}|${userId ?? ""}`;
    let pending = holdersCache.get(key);
    if (!pending) {
      pending = fetchHolders(defs, activeOrgId, userId);
      holdersCache.set(key, pending);
      pending.catch(() => holdersCache.delete(key));
    }
    pending.then(
      (rows) => {
        if (!cancelled) setHolders(rows);
      },
      (cause: unknown) => {
        console.warn("[intelligence] Mandate Holders for the directory could not be read", cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [defs, activeOrgId, userId, organizationState, epoch]);

  return { domains: defs ? buildDomains(defs, holders) : null, defs, error };
}
