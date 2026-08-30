"use client";

/**
 * The brand workspace's Outreach door — the canonical `OutreachFrontDoor`,
 * scoped to the brand in context and writing its `?site=` back onto the brand
 * route rather than the flat one.
 *
 * Without this the door picked `options[0]` — the first website on the
 * PLATFORM — so one client's Outreach page sent the operator prospecting on
 * another client's website, and the mailbox count spanned every organization
 * the signed-in user belongs to.
 *
 * What stays org-wide (campaigns, Chasebox queues, replies, wins) stays and
 * SAYS SO on the page: those CRM records carry no brand link, and faking a
 * filter we cannot apply would be the worse lie. See the scope note at the top
 * of `OutreachFrontDoor`.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { OutreachFrontDoor } from "./OutreachFrontDoor";

export function BrandScopedOutreach() {
  const brand = useMarketingBrand();
  return (
    <OutreachFrontDoor
      brandId={brand.id}
      brandName={brand.name}
      organizationId={brand.organizationId}
      basePath={marketingRoutes.brandOutreach(brand.seg)}
    />
  );
}
