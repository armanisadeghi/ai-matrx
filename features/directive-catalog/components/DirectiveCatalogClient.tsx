"use client";

/**
 * DirectiveCatalogClient — the admin Directive Catalog surface.
 *
 * Left: the live noun × verb grid (see everything in one place). Right: the
 * builder/test panel (trigger via dropdowns). Owns the live fetch (manual
 * Refresh + optional light polling), the loading + error states (component-
 * library treatments, never plain "Loading…"), and the admin gate as a single
 * obvious check — the `(admin)` route group already enforces super-admin at the
 * layout level; this is the documented, lowerable in-page gate (any admin level).
 */

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Server } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectActiveServer } from "@/lib/redux/slices/apiConfigSlice";
import { describeServerTarget } from "@/lib/api/server-identity";
import { useDirectiveCatalog } from "@/features/directive-catalog/hooks/useDirectiveCatalog";
import { DirectiveCatalogGrid } from "@/features/directive-catalog/components/DirectiveCatalogGrid";
import {
  DirectiveBuilderPanel,
  type DirectiveBuilderPick,
} from "@/features/directive-catalog/components/DirectiveBuilderPanel";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import {
  directiveShapeOpenInput,
  type DirectiveShapeSelection,
} from "@/features/directive-catalog/canvas/directiveShapeKind";
import { setEntityTypeAgentWritable } from "@/features/admin/relationships/entityTypeMutations";
import type { NounDirectives } from "@/features/directive-catalog/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { stripTerminalCodes } from "@/utils/errors";

/**
 * No polling. The directive catalog is static metadata — the set of registered
 * Python functions only changes on a backend redeploy, never at runtime. A 30s
 * timer hitting the (agent-saturated) Python backend forever, from an always-
 * open admin page, to re-read data that didn't change, is pure waste (rule 3:
 * don't poll the server). The manual Refresh button covers the rare
 * post-redeploy case. `0` disables the interval in `useDirectiveCatalog`.
 */
const POLL_MS = 0;

export function DirectiveCatalogClient() {
  // The route group is super-admin gated; this is the single, obvious in-page
  // gate that "could eventually be extended to org-level admin users" — lower
  // by swapping the selector, in one place.
  const isAdmin = useAppSelector(selectIsAdmin);

  const activeServer = useAppSelector(selectActiveServer);
  const { catalog, isLoading, error, baseUrl, lastUpdatedAt, refresh } =
    useDirectiveCatalog(POLL_MS);
  const target = describeServerTarget({
    activeServer,
    baseUrl,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const canvas = useOptionalCanvas();
  const inspect = (selection: DirectiveShapeSelection) => {
    openCanvasItem(canvas, directiveShapeOpenInput(selection));
  };
  const [busyToggle, setBusyToggle] = useState<string | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const [builderPick, setBuilderPick] = useState<DirectiveBuilderPick | null>(
    null,
  );

  async function toggleWritable(noun: NounDirectives, enabled: boolean) {
    setBusyToggle(noun.noun);
    try {
      await setEntityTypeAgentWritable(noun.noun, enabled);
      toast.success(
        `${noun.noun} generic write Directives ${enabled ? "enabled" : "disabled"}`,
      );
      refresh();
    } catch (toggleError) {
      toast.error(
        toggleError instanceof Error
          ? stripTerminalCodes(toggleError.message)
          : `Could not update ${noun.noun}`,
      );
    } finally {
      setBusyToggle(null);
    }
  }

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
      <div className="flex min-w-0 items-start gap-2 border-b border-border bg-card px-3 py-2 sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-sm font-semibold text-foreground">
            Matrx Directive Catalog
          </h1>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:gap-3">
          <span
            className="inline-flex items-center gap-1"
            aria-label={`Server: ${target.label}${target.host ? `, ${target.host}` : ", no base URL"}`}
            data-server-kind={target.kind}
          >
            <Server className="h-3.5 w-3.5" />
            {/* Where the calls LAND, never the selected slot's name: in clone
                mode the "production" slot points at the clone-wired local
                server (reviewer, 2026-10-02). */}
            <span className="font-medium text-foreground">{target.label}</span>
            {target.host ? (
              <span className="hidden font-mono xl:inline">{target.host}</span>
            ) : (
              // read-gate-exempt: server-config label (the active server has no base URL configured); not a read's answer
              <span className="hidden text-amber-600 dark:text-amber-400 sm:inline">
                no base URL
              </span>
            )}
          </span>
          {lastUpdatedAt && (
            <span className="hidden lg:inline">
              updated {new Date(lastUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            icon={<RefreshCw
              className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            />}
            type="button"
            variant="outline"
            onClick={refresh}
            disabled={isLoading}
            className="min-w-11 lg:min-w-0"
            aria-label="Refresh directive catalog"
          >
            <span className="sr-only lg:not-sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Body. PHONE-FIRST (G10B review, 2026-10-02): below lg the body is
          the ONE scroll area and the panes stack — the type table at a real
          height, then the other actions, then the builder. Splitting a 375px
          height between them left the table ~0px tall and the builder in a
          strip under the floating chips. From lg up the panes sit side by
          side and each scrolls itself. As the page's scroll owner it takes
          the shell's floating-clearance runway (`data-matrx-page-scroll`), so
          the builder's last line ends clear of the floating chips. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:overflow-hidden"
        data-directive-catalog-body=""
        data-matrx-page-scroll=""
      >
        {isLoading && !catalog ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading directive catalog…
          </div>
        ) : error && !catalog ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <p className="max-w-md text-sm text-foreground">
              Failed to load the directive catalog.
              <ErrorAlchemyMenu />
            </p>
            <p className="max-w-md font-mono text-xs text-muted-foreground">
              {stripTerminalCodes(error)}
              <ErrorAlchemyMenu error={stripTerminalCodes(error)} />
            </p>
            <Button icon={<RefreshCw />} type="button" variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : catalog ? (
          <div className="flex flex-col lg:grid lg:h-full lg:grid-cols-[1fr_22rem]">
            <div className="border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r">
              <DirectiveCatalogGrid
                catalog={catalog}
                busyToggle={busyToggle}
                onToggleWritable={(noun, enabled) =>
                  void toggleWritable(noun, enabled)
                }
                onInspect={inspect}
                onPickNoun={(noun) => {
                  setBuilderPick((prev) => ({
                    noun: noun.noun,
                    nonce: (prev?.nonce ?? 0) + 1,
                  }));
                  // Stacked (phone): the builder is below the table — bring it
                  // into view. Side by side it is already on screen.
                  if (!window.matchMedia("(min-width: 1024px)").matches) {
                    builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
              />
            </div>
            <div ref={builderRef} className="lg:min-h-0" data-directive-builder-pane="">
              <DirectiveBuilderPanel catalog={catalog} pick={builderPick} />
            </div>
          </div>
        ) : null}

        {/* Non-fatal error while a stale catalog is still shown. */}
        {error && catalog && (
          <div className="border-t border-border bg-amber-500/10 px-3 py-1 text-xs text-amber-600 dark:text-amber-400">
            Last refresh failed: {stripTerminalCodes(error)}
            <ErrorAlchemyMenu error={stripTerminalCodes(error)} />
          </div>
        )}
      </div>
    </div>
  );
}
