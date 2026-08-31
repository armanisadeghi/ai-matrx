"use client";

/**
 * A referring domain's actions — ONE definition shared by every backlinks
 * surface that shows a domain that already links to this site.
 *
 * `/backlinks?view=domains` holds TWO datasets over the same subject, toggled
 * by `domainView`: "Our view" (`ReferringDomainIntelligenceTable`, the
 * first-party `referring_domain_profile` directory) and "What the data
 * service reported" (`BacklinkDimensionTable` with `kind="domain"`, the raw
 * provider snapshot). Same identity, same menu, on both.
 */

import { ExternalLink, Globe2, Link2, Newspaper, Send } from "lucide-react";
import {
  type ContextMenuEntityRef,
  type ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  needs,
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { isNonProspectDomainVerdict } from "@/features/crm/outreach-start/service";

export interface ReferringDomainMenuRow {
  /** `referring_domain_profile.id` when this row IS that record. */
  domainId?: string | null;
  /** The domain itself — always present; the identity when there's no profile id. */
  domain: string;
  displayDomain?: string | null;
  /** Our resolved verdict, when this row IS a `referring_domain_profile`. */
  verdict?: string | null;
}

/** There is no separate "domain row" record for the provider snapshot — the
 * identity is the domain itself, or the profile row when one exists. */
export function referringDomainEntityRef(
  row: ReferringDomainMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row?.domain) return null;
  return {
    type: "web_referring_domain",
    id: row.domainId ?? row.domain,
    title: row.displayDomain ?? row.domain,
  };
}

export function useReferringDomainMenuSection(opts: {
  brandId?: string | null;
  siteId: string;
  /** The row the menu was opened on, resolved at select time. */
  getRow: () => ReferringDomainMenuRow | null;
  /**
   * THE GROWTH STEP (2026-08-30) — adopted on `ReferringDomainIntelligenceTable`,
   * which already offers "Start outreach" and "See press opportunities" per
   * row; both grow the shared section so the provider-view table gains them
   * too, once it can supply a row (host-supplied: opening the outreach dialog
   * is a component, not a hook call).
   */
  onStartOutreach?: (row: ReferringDomainMenuRow) => void;
  /** THE CONSISTENCY STEP — what THIS surface cannot do, and why. */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { brandId, siteId, getRow, onStartOutreach, unavailable } = opts;
  const row = getRow();
  const isLinkFarm = isNonProspectDomainVerdict(row?.verdict ?? null);
  const section: ContextMenuExtraSection = {
    id: "referring-domain-actions",
    label: "Referring domain",
    icon: Globe2,
    items: [
      {
        kind: "link",
        id: "rd-open",
        label: "Open referring domain",
        icon: ExternalLink,
        href: row?.domain ? `https://${row.domain}` : "#",
        target: "_blank",
        disabled: !row?.domain,
      },
      {
        kind: "link",
        id: "rd-our-view",
        label: "See our verdict on this domain",
        icon: Link2,
        href: marketingRoutes.site(
          brandId ?? null,
          siteId,
          "/backlinks?view=domains",
        ),
      },
      {
        kind: "link",
        id: "rd-provider-view",
        label: "See the provider's data on this domain",
        icon: Link2,
        href: marketingRoutes.site(
          brandId ?? null,
          siteId,
          "/backlinks?view=domains&domainView=provider",
        ),
      },
      {
        kind: "item",
        id: "rd-start-outreach",
        label: "Start outreach",
        icon: Send,
        disabled: !row || !onStartOutreach || isLinkFarm,
        description: isLinkFarm
          ? "Resolved as a link farm — record your own verdict to override"
          : !onStartOutreach && row
            ? needs("outreach on this surface")
            : undefined,
        onSelect: () => {
          if (row && onStartOutreach) onStartOutreach(row);
        },
      },
      {
        kind: "link",
        id: "rd-press",
        label: "See press opportunities",
        icon: Newspaper,
        href: brandId
          ? `${marketingRoutes.brandReputation(brandId, siteId)}?tab=publications`
          : "#",
        disabled: !brandId,
        description: !brandId ? needs("a brand") : undefined,
      },
    ],
  };
  return withAvailability(section, unavailable);
}
