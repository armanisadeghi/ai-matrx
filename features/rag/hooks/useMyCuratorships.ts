"use client";

/**
 * "Which industries do I curate?" — the ONE read behind the curator front door
 * (`/knowledge/library-curate`).
 *
 * `iam.industry_curators` has granted real authoring rights since 2026-08-22
 * (`seo._pack_assert_author` / `_pack_assert_creator` accept a curator of the pack's
 * industry while the pack is draft/proposed, and `seo.starter_pack_catalog` already
 * returns a curator their industry's packs with `can_author`), but the only surface
 * exercising any of it was the admin console — which the `(admin)` layout redirects
 * for anyone without an `admin.admins` row. This hook is the missing read: the
 * admin-side inverse (`public.industry_curator_list(industry)`) is admin-only and
 * answers the other question.
 *
 * SoR: common-docs/systems/platform/library/STATE.md.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";
import { makeAssertData } from "@/utils/errors";

const assertData = makeAssertData("load the industries you curate");

export interface Curatorship {
  industryId: string;
  slug: string;
  name: string;
  facet: string;
  description: string | null;
  isActive: boolean;
  grantedAt: string;
  draftCount: number;
  proposedCount: number;
  ratifiedCount: number;
}

export const myCuratorshipsQueryKey = ["library", "my-curatorships"] as const;

export async function fetchMyCuratorships(signal?: AbortSignal): Promise<Curatorship[]> {
  const response = await supabase
    .rpc("my_industry_curatorships")
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return rows.map((r) => ({
    industryId: r.industry_id,
    slug: r.slug,
    name: r.name,
    facet: r.facet,
    description: r.description,
    isActive: r.is_active,
    grantedAt: r.granted_at,
    draftCount: r.draft_count,
    proposedCount: r.proposed_count,
    ratifiedCount: r.ratified_count,
  }));
}

/**
 * Lazy, cached. Consumers that only need "is this person a curator at all"
 * (the Catalog's door into curation) read `.data?.length` from the same cache
 * rather than firing a second probe.
 */
export function useMyCuratorships() {
  return useQuery({
    queryKey: myCuratorshipsQueryKey,
    queryFn: ({ signal }) => fetchMyCuratorships(signal),
    staleTime: 5 * 60_000,
  });
}
