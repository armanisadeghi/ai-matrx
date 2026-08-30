"use client";

/**
 * The brand workspace's Press Room — the canonical `PressRoomWorkspace`, told
 * which brand it is standing in.
 *
 * Without this the workspace defaulted to the first brand alphabetically
 * across the entire platform, so `/marketing/<client>/pr` showed a different
 * client's stories, journalists and pitches under the requested client's name.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import PressRoomWorkspace from "./PressRoomWorkspace";

export function BrandScopedPressRoom() {
  const brand = useMarketingBrand();
  return <PressRoomWorkspace scopedBrandId={brand.id} />;
}
