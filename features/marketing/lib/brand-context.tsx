"use client";

/**
 * Client context for the `/marketing/[brandId]` client workspace.
 *
 * The server layout resolves the dual-mode route param (key or UUID) ONCE and
 * provides the resolved identity here, so client pages/components consume real
 * UUIDs (`brand.id`, `site.id`) and never re-derive them from the URL. Route
 * params under the brand tree are ADDRESSES, not identifiers — anything that
 * queries the database goes through this context.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface MarketingBrandContextValue {
  id: string;
  /** Canonical URL key (null only for rows created before keys were wired). */
  slug: string | null;
  name: string;
  organizationId: string;
  /** The path segment builders should use for this brand. */
  seg: string;
}

export interface MarketingSiteContextValue {
  id: string;
  slug: string | null;
  name: string | null;
  domain: string;
  seg: string;
}

const BrandContext = createContext<MarketingBrandContextValue | null>(null);
const SiteContext = createContext<MarketingSiteContextValue | null>(null);

export function MarketingBrandProvider({
  value,
  children,
}: {
  value: MarketingBrandContextValue;
  children: ReactNode;
}) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function MarketingSiteProvider({
  value,
  children,
}: {
  value: MarketingSiteContextValue;
  children: ReactNode;
}) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/** The resolved brand for the current `/marketing/[brandId]` subtree. */
export function useMarketingBrand(): MarketingBrandContextValue {
  const value = useContext(BrandContext);
  if (!value) {
    throw new Error(
      "useMarketingBrand must render inside /marketing/[brandId] (MarketingBrandProvider)",
    );
  }
  return value;
}

/** Nullable variant for components that also render outside the brand tree. */
export function useMarketingBrandOptional(): MarketingBrandContextValue | null {
  return useContext(BrandContext);
}

/** The resolved site for a `websites/[siteId]` or `seo/[siteId]` subtree. */
export function useMarketingSite(): MarketingSiteContextValue {
  const value = useContext(SiteContext);
  if (!value) {
    throw new Error(
      "useMarketingSite must render inside a [siteId] subtree (MarketingSiteProvider)",
    );
  }
  return value;
}

export function useMarketingSiteOptional(): MarketingSiteContextValue | null {
  return useContext(SiteContext);
}
