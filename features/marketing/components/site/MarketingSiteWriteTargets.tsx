"use client";

/**
 * MarketingSiteWriteTargets — the live handlers for the write half of
 * `matrx-user/marketing-site` (the two identity targets its manifest
 * declares: `site_name`, `site_description`).
 *
 * An agent result rendered anywhere on the site workspace calls
 * `applySurfaceWrite("<target>", value)` and the value lands here, through
 * the site's CANONICAL identity service (`updateSiteIdentity` via
 * `useUpdateSiteIdentity`) — never a bespoke callback, never a direct DB
 * write. Both targets are `entity` mode: on Apply the row persists
 * immediately and the site caches refetch.
 *
 * Renders nothing. Mounted once by `MarketingSiteLayoutClient` inside the
 * site surface provider, so the handlers are live on every site route where
 * `matrx-user/marketing-site` is the active surface (overview, settings,
 * access, cost). Handlers throw on bad input or a failed save — the
 * writeback runtime turns that into the loud toast + captured error.
 */

import { useEffect, useRef } from "react";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MARKETING_SITE_SURFACE_NAME } from "@/features/marketing/lib/scopes/site-surface-base";
import { useUpdateSiteIdentity } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";

/** Wire value for the `site_name` target. */
export interface SiteNameWrite {
  name: string;
}

/** Wire value for the `site_description` target. */
export interface SiteDescriptionWrite {
  description: string;
}

function requiredString(value: unknown, key: string, target: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${target}: ${key} must be a non-empty string.`);
  }
  return raw.trim();
}

export function MarketingSiteWriteTargets({ site }: { site: MarketingSite }) {
  const mutation = useUpdateSiteIdentity();

  // The freshest version we KNOW. `platform._touch_row` bumps `version` on
  // every UPDATE and the site refetch is async, so between a successful write
  // and the refetch landing, `site.version` is stale by one — a second
  // consecutive apply would spuriously trip the optimistic lock with
  // "changed in another session". `updateSiteIdentity` RETURNS the fresh
  // row; keep its version here and use max(prop, ref).
  const versionRef = useRef(site.version);
  useEffect(() => {
    versionRef.current = Math.max(versionRef.current, site.version);
  }, [site.version]);

  useSurfaceWriteHandlers(MARKETING_SITE_SURFACE_NAME, {
    site_name: async (value: unknown) => {
      const name = requiredString(value, "name", "site_name");
      const updated = await mutation.mutateAsync({
        siteId: site.id,
        expectedVersion: versionRef.current,
        patch: { name },
      });
      versionRef.current = Math.max(versionRef.current, updated.version);
    },

    site_description: async (value: unknown) => {
      const description = requiredString(
        value,
        "description",
        "site_description",
      );
      const updated = await mutation.mutateAsync({
        siteId: site.id,
        expectedVersion: versionRef.current,
        patch: { description },
      });
      versionRef.current = Math.max(versionRef.current, updated.version);
    },
  });

  return null;
}
