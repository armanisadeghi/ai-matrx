"use client";

/**
 * The brand workspace's Email door — the canonical `EmailFrontDoor`, counting
 * only this brand's organization's mailboxes.
 *
 * Without the org, the count silently spanned every organization the
 * signed-in user belongs to, so an agency operator saw one number covering all
 * of their clients.
 *
 * The brand's NAME goes down too, because the rest of the page is genuinely
 * not brand-scopable (templates, campaigns, org template libraries have no
 * brand link) — so those doors stay and name their real reach instead of
 * pretending to be filtered.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { EmailFrontDoor } from "./EmailFrontDoor";

export function BrandScopedEmail() {
  const brand = useMarketingBrand();
  return (
    <EmailFrontDoor
      organizationId={brand.organizationId}
      brandName={brand.name}
    />
  );
}
