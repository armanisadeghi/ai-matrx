"use client";

/**
 * ActionCatalogClient — the admin Action Catalog surface.
 *
 * Left: the live noun × verb grid (see everything in one place). Right: the
 * builder/test panel (trigger via dropdowns). Owns the live fetch (manual
 * Refresh + optional light polling), the loading + error states (component-
 * library treatments, never plain "Loading…"), and the admin gate as a single
 * obvious check — the `(admin)` route group already enforces super-admin at the
 * layout level; this is the documented, lowerable in-page gate (any admin level).
 */

import { AlertTriangle, Loader2, RefreshCw, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectActiveServer } from "@/lib/redux/slices/apiConfigSlice";
import { useActionCatalog } from "@/features/action-catalog/hooks/useActionCatalog";
import { ActionCatalogGrid } from "@/features/action-catalog/components/ActionCatalogGrid";
import { ActionBuilderPanel } from "@/features/action-catalog/components/ActionBuilderPanel";

/**
 * No polling. The action catalog is static metadata — the set of registered
 * Python functions only changes on a backend redeploy, never at runtime. A 30s
 * timer hitting the (agent-saturated) Python backend forever, from an always-
 * open admin page, to re-read data that didn't change, is pure waste (rule 3:
 * don't poll the server). The manual Refresh button covers the rare
 * post-redeploy case. `0` disables the interval in `useActionCatalog`.
 */
const POLL_MS = 0;

export function ActionCatalogClient() {
  // The route group is super-admin gated; this is the single, obvious in-page
  // gate that "could eventually be extended to org-level admin users" — lower
  // by swapping the selector, in one place.
  const isAdmin = useAppSelector(selectIsAdmin);

  const activeServer = useAppSelector(selectActiveServer);
  const { catalog, isLoading, error, baseUrl, lastUpdatedAt, refresh } =
    useActionCatalog(POLL_MS);

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header strip */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold text-foreground">
            Matrx Action Catalog
          </h1>
          <span className="text-xs text-muted-foreground">
            Every noun × every verb, live from the backend
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Server className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{activeServer}</span>
            {baseUrl ? (
              <span className="font-mono">{baseUrl}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                no base URL
              </span>
            )}
          </span>
          {lastUpdatedAt && (
            <span>
              updated {new Date(lastUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="gap-1"
          >
            <RefreshCw
              className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {isLoading && !catalog ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading action catalog…
          </div>
        ) : error && !catalog ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <p className="max-w-md text-sm text-foreground">
              Failed to load the action catalog.
            </p>
            <p className="max-w-md font-mono text-xs text-muted-foreground">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : catalog ? (
          <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_22rem]">
            <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
              <ActionCatalogGrid catalog={catalog} />
            </div>
            <div className="min-h-0">
              <ActionBuilderPanel catalog={catalog} />
            </div>
          </div>
        ) : null}

        {/* Non-fatal error while a stale catalog is still shown. */}
        {error && catalog && (
          <div className="border-t border-border bg-amber-500/10 px-3 py-1 text-xs text-amber-600 dark:text-amber-400">
            Last refresh failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
