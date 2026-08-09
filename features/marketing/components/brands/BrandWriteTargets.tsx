"use client";

/**
 * BrandWriteTargets — the live handlers for the write half of
 * `matrx-user/marketing-brand` (the targets its manifest declares).
 *
 * This is the receiving end of the `profile_author` agent role: an agent on
 * the brand cockpit calls `applySurfaceWrite("<target>", value)` and the value
 * lands here, through the brand's CANONICAL `updateBrand` mutation — the same
 * one `BrandEditorDialog`'s Save button uses, under the same optimistic
 * version guard. Never a bespoke callback, never a direct DB write.
 *
 * The load-bearing detail: `brand_profile` is ONE jsonb column holding a
 * nested object, so a patch carrying only the sub-keys an agent named would
 * erase every other field. `applyProfilePatch` therefore reads the brand's
 * CURRENT profile, merges the named sub-keys over it, and writes the whole
 * object back. Validation and merging live in
 * `features/marketing/lib/brand-write-targets.ts` so they can be unit-tested.
 *
 * Renders nothing. Mount once inside the cockpit's `SurfaceRuntimeProvider`
 * with the loaded brand row. Handlers throw on bad input or a failed save —
 * the writeback runtime turns that into the loud toast + captured error; a
 * version-guard conflict surfaces as its own "changed in another session"
 * message.
 */

import { useEffect, useRef } from "react";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useUpdateBrand } from "@/features/marketing/data/hooks";
import {
  buildCompetitorsPatch,
  buildContentGuidelinesPatch,
  buildOfferingsPatch,
  buildVoicePatch,
  mergeBrandProfile,
} from "@/features/marketing/lib/brand-write-targets";
import {
  brandProfileToJson,
  parseBrandProfile,
} from "@/features/marketing/types";
import type { BrandProfile, MarketingBrand } from "@/features/marketing/types";

/** The surface this cockpit mounts — shared with `BrandWorkspace`'s provider. */
export const MARKETING_BRAND_SURFACE_NAME = "matrx-user/marketing-brand";

/** Wire value for `brand_profile_voice`. Omitted fields keep their current text. */
export interface BrandProfileVoiceWrite {
  audience?: string;
  voice_tone?: string;
  positioning?: string;
}

/** Wire value for `brand_profile_offerings`. Replaces the full list. */
export interface BrandProfileOfferingsWrite {
  offerings: string[];
}

/** Wire value for `brand_profile_competitors`. Replaces the full list. */
export interface BrandProfileCompetitorsWrite {
  competitors: string[];
}

/** Wire value for `brand_profile_content_guidelines`. Replaces the full text. */
export interface BrandProfileContentGuidelinesWrite {
  content_guidelines: string;
}

export function BrandWriteTargets({ brand }: { brand: MarketingBrand }) {
  const updateBrandMutation = useUpdateBrand();

  // The freshest version we KNOW. `updateBrand` guards on `version` and
  // `platform._touch_row` bumps it on every UPDATE, so between a successful
  // write and the cockpit's refetch landing, the `brand` prop is stale by one —
  // a second consecutive apply would spuriously trip the optimistic lock with
  // "changed in another session". The mutation RETURNS the fresh row; keep its
  // version here and use max(prop, ref). Same pattern as the page workspace.
  const versionRef = useRef(brand.version);
  useEffect(() => {
    versionRef.current = Math.max(versionRef.current, brand.version);
  }, [brand.version]);

  /**
   * Merge a target's sub-keys over the brand's CURRENT profile and persist the
   * whole object through the canonical mutation.
   */
  const applyProfilePatch = async (patch: Partial<BrandProfile>) => {
    const merged = mergeBrandProfile(parseBrandProfile(brand.profile), patch);
    const updated = await updateBrandMutation.mutateAsync({
      brandId: brand.id,
      expectedVersion: versionRef.current,
      patch: { profile: brandProfileToJson(merged) },
    });
    versionRef.current = Math.max(versionRef.current, updated.version);
  };

  useSurfaceWriteHandlers(MARKETING_BRAND_SURFACE_NAME, {
    brand_profile_voice: async (value: unknown) => {
      await applyProfilePatch(buildVoicePatch(value));
    },
    brand_profile_offerings: async (value: unknown) => {
      await applyProfilePatch(buildOfferingsPatch(value));
    },
    brand_profile_competitors: async (value: unknown) => {
      await applyProfilePatch(buildCompetitorsPatch(value));
    },
    brand_profile_content_guidelines: async (value: unknown) => {
      await applyProfilePatch(buildContentGuidelinesPatch(value));
    },
  });

  return null;
}
