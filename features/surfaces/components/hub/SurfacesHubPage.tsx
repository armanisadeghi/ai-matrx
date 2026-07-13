"use client";

/**
 * SurfacesHubPage — the user-facing `/surfaces` LIST view (Wave 5).
 *
 * Lists every ACTIVE `matrx-user` surface that has something a user can
 * configure: ≥1 agent role or ≥1 config namespace (from the code-first
 * manifest registry, intersected with live `ui_surface.is_active`). Clicking
 * a row opens the detail hub at `/surfaces/<local-name>` where the user picks
 * agents per role and edits per-surface config at Me/Org scope.
 *
 * Entry pages are LIST views (CLAUDE.md) — this is the savior page for the
 * per-surface settings that previously only existed buried inside features.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronRight, Loader2, SlidersHorizontal } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { getAllManifests } from "@/features/surfaces/manifests/registry";
import { getSurfaceDisplayLabel } from "@/features/surfaces/runtime/fetchRelatedSurfaces";
import { listSurfaceOptions } from "@/features/surfaces/services/surfaces.service";
import type { SurfaceManifest } from "@/features/surfaces/types";
import { cn } from "@/lib/utils";

const USER_CLIENT_PREFIX = "matrx-user/";

/** Local slug for hub URLs: `matrx-user/transcript-scribe` → `transcript-scribe`. */
export function surfaceHubHref(surfaceName: string): string {
  return `/surfaces/${surfaceName.slice(USER_CLIENT_PREFIX.length)}`;
}

function isConfigurable(m: SurfaceManifest): boolean {
  return (
    (m.agentRoles?.length ?? 0) > 0 || (m.configNamespaces?.length ?? 0) > 0
  );
}

interface HubRow {
  manifest: SurfaceManifest;
  description: string | null;
}

export function SurfacesHubPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [rows, setRows] = useState<HubRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const configurable = getAllManifests().filter(
          (m) =>
            m.surfaceName.startsWith(USER_CLIENT_PREFIX) && isConfigurable(m),
        );
        const active = await listSurfaceOptions();
        const activeByName = new Map(active.map((s) => [s.name, s]));
        // LOUD drift signal: a configurable manifest with no active ui_surface
        // row is registered in code but invisible here — that's an unsynced or
        // deactivated surface, never a silent skip.
        for (const m of configurable) {
          if (!activeByName.has(m.surfaceName)) {
            console.warn(
              `[surfaces] hub: manifest "${m.surfaceName}" declares roles/config but has no ACTIVE ui_surface row — sync the manifest to the DB (or re-activate the row) or it stays hidden from /surfaces`,
            );
          }
        }
        if (cancelled) return;
        setRows(
          configurable
            .filter((m) => activeByName.has(m.surfaceName))
            .map((m) => ({
              manifest: m,
              description:
                activeByName.get(m.surfaceName)?.description ?? null,
            })),
        );
      } catch (err) {
        console.error("[surfaces] hub list load failed", err);
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = (href: string) => {
    if (isPending) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 p-0">
          <h1 className="text-sm font-medium text-foreground truncate">
            Surfaces
          </h1>
          <span className="text-xs text-muted-foreground truncate">
            Per-page agents &amp; settings
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <div
          className="h-full overflow-y-auto"
          style={{ paddingTop: "var(--shell-header-h)" }}
        >
          <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-2">
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {!rows && !error && (
              <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading surfaces…
              </div>
            )}
            {rows && rows.length === 0 && (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                No configurable surfaces are active yet.
              </p>
            )}
            {rows && rows.length > 0 && (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
                {rows.map(({ manifest, description }) => {
                  const href = surfaceHubHref(manifest.surfaceName);
                  const roleCount = manifest.agentRoles?.length ?? 0;
                  const nsCount = manifest.configNamespaces?.length ?? 0;
                  const busy = isPending && pendingHref === href;
                  return (
                    <li key={manifest.surfaceName}>
                      <button
                        type="button"
                        onClick={() => open(href)}
                        disabled={isPending}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                          busy && "opacity-60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {getSurfaceDisplayLabel(manifest.surfaceName)}
                            </span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">
                              {manifest.surfaceName}
                            </span>
                          </div>
                          {description && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                          {roleCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                              <Bot className="h-3 w-3" />
                              {roleCount} role{roleCount === 1 ? "" : "s"}
                            </span>
                          )}
                          {nsCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                              <SlidersHorizontal className="h-3 w-3" />
                              {nsCount} config
                            </span>
                          )}
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
