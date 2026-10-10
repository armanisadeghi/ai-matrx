"use client";

/**
 * The agent surface for the Identity hub and its rooms (Messaging, Claims,
 * Audience, Voice, Offerings, Strategy). Without it an agent opened on these
 * pages saw nothing about the brand — the brand's messaging, claims, personas
 * and voice were on screen but never declared. It mounts the brand's own
 * surface (`matrx-user/marketing-brand`): `brand_context` is the XML snapshot
 * (mission, vision, values, pitches, pillars, claims, personas, facts, sites)
 * and `brand_profile` writes go through the same version-guarded save the
 * cockpit uses. Rooms that carry a surface of their own (Media, Knowledge,
 * Guidelines) mount it below this one and take precedence.
 *
 * `getScope` never fetches: a section that has not loaded yet is omitted.
 */

import { useCallback, type ReactNode } from "react";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBrandScope } from "@/features/surfaces/manifests/marketing-brand.manifest";
import {
  MARKETING_BRAND_SURFACE_NAME,
  MarketingBrandWriteTargets,
} from "@/features/marketing/components/brands/MarketingBrandWriteTargets";
import {
  useBrand,
  useBrandAssets,
  useBrandProperties,
  useBrandSites,
  useBusinessFacts,
} from "@/features/marketing/data/hooks";
import { useBrandPersonas } from "@/features/marketing/data/personas";
import { buildBrandContextXml } from "@/features/marketing/lib/surface-context";
import { parseBrandProfile } from "@/features/marketing/types";

export function BrandIdentitySurface({
  brandId,
  children,
}: {
  brandId: string;
  children: ReactNode;
}) {
  const brand = useBrand(brandId);
  // access-errors: ok — scope-only reads under the gated brand; absent sections are omitted from the scope
  const properties = useBrandProperties(brandId);
  const personas = useBrandPersonas(brandId);
  const facts = useBusinessFacts(brandId);
  const assets = useBrandAssets(brandId);
  const sites = useBrandSites(brandId);
  const current = brand.data;

  const getScope = useCallback(() => {
    if (!current) return createMarketingBrandScope({ brand_id: brandId });
    const profile = parseBrandProfile(current.profile);
    return createMarketingBrandScope({
      brand_id: brandId,
      brand_name: current.name,
      brand_context: buildBrandContextXml({
        brand: current,
        properties: properties.data ?? [],
        personas: personas.data ?? [],
        facts: facts.data ?? [],
        assets: assets.data ?? [],
        sites: sites.data ?? [],
      }),
      ...(Object.keys(profile).length > 0
        ? { brand_profile: profile as Record<string, unknown> }
        : {}),
    });
  }, [
    current,
    brandId,
    properties.data,
    personas.data,
    facts.data,
    assets.data,
    sites.data,
  ]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_BRAND_SURFACE_NAME}
      getScope={getScope}
    >
      {current ? <MarketingBrandWriteTargets brand={current} /> : null}
      {children}
    </SurfaceRuntimeProvider>
  );
}
