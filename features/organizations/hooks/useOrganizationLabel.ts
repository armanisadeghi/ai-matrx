"use client";

/**
 * An organization's name and slug for a label (a chip, a heading), read ONCE
 * per organization into Redux (`useStoreRead`, key `organizations.label:<id>`):
 * every chip naming the same organization, and every remount or wake of one,
 * shares the one answer. Label enrichment only — a failed read is logged and
 * answers null, and the label is then simply absent.
 */

import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

export interface OrganizationLabel {
  name: string;
  slug: string;
}

export function useOrganizationLabel(organizationId: string | null | undefined): OrganizationLabel | null {
  const read = useStoreRead<OrganizationLabel | null>(
    organizationId ? `organizations.label:${organizationId}` : null,
    async () => {
      const o = await getOrganizationBySlugOrId(organizationId as string).catch((err: unknown) => {
        console.error("[useOrganizationLabel] organization label unavailable:", err);
        return null;
      });
      return o ? { name: o.name, slug: o.slug } : null;
    },
  );
  return read.data ?? null;
}
