"use client";

/**
 * The brand workspace's Email door — the canonical `EmailFrontDoor`, counting
 * only this brand's organization's mailboxes.
 *
 * Without the org, the count silently spanned every organization the
 * signed-in user belongs to, so an agency operator saw one number covering all
 * of their clients.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { EmailFrontDoor } from "./EmailFrontDoor";

export function BrandScopedEmail() {
  const brand = useMarketingBrand();
  return <EmailFrontDoor organizationId={brand.organizationId} />;
}
