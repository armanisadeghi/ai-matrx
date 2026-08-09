"use client";

/**
 * MarketingBrandWriteTargets — the live handlers for the write half of
 * `matrx-user/marketing-brand` (the targets its manifest declares).
 *
 * An agent result calls `applySurfaceWrite("<target>", value)` and the value
 * lands here, through the brand's CANONICAL service (`updateBrand` via
 * `useUpdateBrand`) — never a bespoke callback, never a direct DB write.
 * Validation + jsonb merge live in the pure `lib/brand-write-targets.ts`
 * (unit-tested — the destructive failure to prevent is a profile write that
 * drops the rest of the client's profile). Confirmed business facts, assets,
 * and properties have NO handler on purpose: they are human-owned truth
 * promoted through the discovery review inbox (see the manifest's
 * writeTargets comment).
 *
 * Renders nothing. Mount once inside the cockpit's `SurfaceRuntimeProvider`
 * subtree with the loaded brand row. Handlers throw on bad input or a failed
 * save — the writeback runtime turns that into the loud toast + captured
 * error; a version-guard conflict surfaces as its own message.
 */

import { useEffect, useRef } from "react";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useUpdateBrand } from "@/features/marketing/data/hooks";
import {
  mergeBrandProfileWrite,
  validateBrandIdentityWrite,
} from "@/features/marketing/lib/brand-write-targets";
import {
  brandProfileToJson,
  parseBrandProfile,
} from "@/features/marketing/types";
import type { MarketingBrand } from "@/features/marketing/types";

export const MARKETING_BRAND_SURFACE_NAME = "matrx-user/marketing-brand";

export function MarketingBrandWriteTargets({
  brand,
}: {
  brand: MarketingBrand;
}) {
  const updateMutation = useUpdateBrand();

  // The freshest version we KNOW. `platform._touch_row` bumps `version` on
  // every UPDATE and the cockpit refetch lags the write, so between a
  // successful apply and the refetch landing, `brand.version` is stale by
  // one — a second consecutive apply would spuriously trip the optimistic
  // lock. `updateBrand` RETURNS the fresh row; keep max(prop, ref).
  const versionRef = useRef(brand.version);
  useEffect(() => {
    versionRef.current = Math.max(versionRef.current, brand.version);
  }, [brand.version]);

  useSurfaceWriteHandlers(MARKETING_BRAND_SURFACE_NAME, {
    brand_profile: async (value: unknown) => {
      const merged = mergeBrandProfileWrite(
        parseBrandProfile(brand.profile),
        value,
      );
      const updated = await updateMutation.mutateAsync({
        brandId: brand.id,
        expectedVersion: versionRef.current,
        patch: { profile: brandProfileToJson(merged) },
      });
      versionRef.current = Math.max(versionRef.current, updated.version);
    },

    brand_identity: async (value: unknown) => {
      const patch = validateBrandIdentityWrite(value);
      const updated = await updateMutation.mutateAsync({
        brandId: brand.id,
        expectedVersion: versionRef.current,
        patch,
      });
      versionRef.current = Math.max(versionRef.current, updated.version);
    },
  });

  return null;
}
