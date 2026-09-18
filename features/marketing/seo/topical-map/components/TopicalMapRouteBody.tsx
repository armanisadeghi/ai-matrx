"use client";

/**
 * THE ONE route adapter for the map workspace (CONTRACTS.md §1).
 *
 * Six route files render this and nothing else; it is the only place in the
 * feature that reads the URL or the brand. Everything it learns it hands down
 * as props, which is what lets the SAME body render in a window, a drawer, a
 * canvas card and a peek — none of which has a `[brandId]` segment above it, so
 * `useMarketingBrand()` would THROW there and `useMapWorkspaceParams` would
 * read the wrong pathname.
 *
 * It owns the page chrome, exactly as the old body did: the scroll container,
 * the textured background, and the shell-header top offset. Nothing below this
 * file knows the shell header exists.
 */

import { startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useMarketingBrandOptional } from "@/features/marketing/lib/brand-context";

import { MapLinkProvider } from "../links";
import { useMapWorkspaceParams } from "../useMapWorkspaceParams";
import { TopicalMapWorkspaceBody } from "./TopicalMapWorkspaceBody";

export function TopicalMapRouteBody({ mapId }: { mapId: string }) {
  const router = useRouter();
  // The route tree guarantees a brand; the OPTIONAL reader is used anyway so a
  // misplaced render degrades to the brand-free id doors instead of throwing a
  // whole screen away (the nullable variant exists for exactly this).
  const brand = useMarketingBrandOptional();
  const { screen, siteId, screenHref } = useMapWorkspaceParams(mapId);
  // `?topic=<slug>` rides in from the topic id door; the body reveals it once
  // the tree it names is loaded.
  const revealSlug = useSearchParams().get("topic");

  return (
    <div className={screen === "graph" ? "flex h-full min-h-0 flex-col overflow-hidden bg-textured" : "h-full overflow-y-auto overflow-x-hidden bg-textured"}>
      <div className={screen === "graph" ? "flex min-h-0 w-full flex-1 flex-col pt-[var(--shell-header-h)]" : "mx-auto h-full min-h-0 w-full max-w-5xl p-4 pt-[calc(var(--shell-header-h)+1rem)] sm:p-6 sm:pt-[calc(var(--shell-header-h)+1.5rem)]"}>
        <MapLinkProvider brand={brand}>
          <TopicalMapWorkspaceBody
            mapId={mapId}
            screen={screen}
            siteId={siteId}
            host="page"
            revealSlug={revealSlug}
            onScreenChange={(next) => {
              // A view is a ROUTE here, so a screen change is navigation.
              // `startTransition` keeps the current screen interactive while
              // the next one resolves instead of blanking the workspace.
              startTransition(() => {
                router.push(screenHref(next));
              });
            }}
          />
        </MapLinkProvider>
      </div>
    </div>
  );
}
