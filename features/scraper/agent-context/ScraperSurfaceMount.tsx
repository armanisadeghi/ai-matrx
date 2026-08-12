"use client";

/**
 * @registry-status: sub-component
 * The `matrx-user/scraper` surface mount for the `/scraper` ROUTES.
 *
 * Until this shipped, the surface had exactly one emitter — the floating
 * `scraperWindow` workspace (`parts/ScraperFloatingWorkspace.tsx`) — even
 * though `urlPattern` is `/scraper` and `surfaceFromPathname` resolves every
 * `/scraper/*` path to it. The four hub routes are where the header nav
 * actually takes people, and they published no scope at all: an agent run
 * started there had neither the evidence to write from nor a handler to write
 * through. The manifest's own write-target docblock named this as the missing
 * piece ("Giving them targets would mean adopting the surface on those routes
 * first, read side included; that is its own task"). This is that task.
 *
 * ONE component instead of four copies: each route hands over the live state
 * it owns and the setters its own inputs call, and gets back the provider, the
 * canonical scope (`buildScraperContextData` — the same pure mapper the
 * floating workspace uses, so the routes cannot emit a different shape) and
 * the shared write handlers.
 *
 * PER-MOUNT POSTURE: a route passes only the setters it has, and
 * `buildScraperWriteHandlers` returns a handler only for the targets those
 * cover — so `listAgentWritableTargets` offers each route exactly the targets
 * it can honour. `/scraper` and `/scraper/quick` get `scrape_command` (URL
 * only); `/scraper/search` gets `scrape_command` (keyword), the result budget
 * and hit selection; `/scraper/search-and-scrape` gets `scrape_command`
 * (keyword), the page budget and page selection. None of them can switch mode,
 * because on these routes the mode IS the route — the header nav is how a user
 * changes it, and an agent gets told which route to open instead.
 */

import type { ReactNode } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  buildScraperContextData,
  SCRAPER_CONTEXT_MENU_PROPS,
  type BuildScraperContextDataArgs,
} from "@/features/scraper/agent-context/buildScraperContextData";
import {
  buildScraperWriteHandlers,
  type ScraperWriteMount,
} from "@/features/scraper/agent-context/scraperWriteHandlers";

export interface ScraperSurfaceMountProps {
  /** Live route state → the surface's declared read values. */
  context: BuildScraperContextDataArgs;
  /**
   * The setters THIS route owns. Omit it entirely for a read-only mount — the
   * surface still publishes its scope, it just offers no write tool.
   */
  write?: Omit<ScraperWriteMount, "mode" | "isScraping">;
  children: ReactNode;
}

export function ScraperSurfaceMount({
  context,
  write,
  children,
}: ScraperSurfaceMountProps) {
  // Both callbacks read `context` / `write` from the CURRENT render, so a
  // launch or an apply always sees what the user is looking at right now.
  const getScope = () =>
    buildScraperContextData(context) as unknown as SurfaceScopePayload;

  const getWriteHandlers = write
    ? () =>
        buildScraperWriteHandlers({
          ...write,
          mode: context.mode,
          isScraping: Boolean(context.isScraping),
        })
    : undefined;

  return (
    <SurfaceRuntimeProvider
      surfaceName={SCRAPER_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
      isEditable={Boolean(write)}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
