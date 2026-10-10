"use client";

/**
 * Whether the viewer may WRITE to this brand's socials (track, refresh, capture, save, transcript, breakdown,
 * Studio actions): the record's own `web_brand` access answer, editor or above. Inside the Socials section it
 * is the shell's answer; in a floating post window or canvas tab (no section around it) it resolves the brand
 * from the address segment. RLS stays the boundary; this only keeps controls the viewer cannot use off the screen.
 */

import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { isUuidShape } from "@ai-matrx/kit/uuid";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import { useMarketingBrandOptional } from "@/features/marketing/lib/brand-context";
import { SocialsContext } from "./components/SocialsContext";

async function brandIdForSegment(seg: string): Promise<string | null> {
  if (isUuidShape(seg)) return seg;
  const db = await authenticatedWebDb(supabase);
  const { data } = await db.from("brand").select("id").eq("slug", seg).is("deleted_at", null).maybeSingle();
  return data?.id ?? null;
}

export function useCanEditSocial(brandSeg?: string, brandIdArg?: string | null): boolean {
  const section = useContext(SocialsContext);
  const brand = useMarketingBrandOptional();
  const known = section?.brandId ?? brand?.id ?? brandIdArg ?? null;
  const resolved = useQuery({
    queryKey: ["marketing", "social", "brand-id-for-seg", brandSeg],
    enabled: known === null && Boolean(brandSeg),
    queryFn: () => brandIdForSegment(brandSeg as string),
    staleTime: 5 * 60_000,
  });
  const brandId = known ?? resolved.data ?? undefined;
  const access = useAccess("web_brand", brandId);
  if (section) return section.canEdit;
  return Boolean(brandId) && canEditAccess(access.level);
}
