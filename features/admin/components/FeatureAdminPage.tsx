// features/admin/components/FeatureAdminPage.tsx
//
// The platform primitive every feature's admin map renders through.
// Server component. Admin-gated (any admin level — redirects everyone
// else to home; never throws). Utilitarian — built for an admin who
// already knows what these resources are. No headers explaining
// "Core Routes are pages users navigate to", no novel-length card
// descriptions, no max-width that wastes 60% of the viewport. Every
// resource link opens in a new tab so the map stays as a workspace.
// Every window-panel card has an "Open" button that dispatches the
// overlay live.
//
// Add a new feature: write a `FeatureAdminMap` object, render
// `<FeatureAdminPage map={...} />` from `app/(core)/[feature]/admin/
// page.tsx`. The drift warnings flag anything you forgot.

export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AlertCircle,
  Boxes,
  Component,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  LayoutPanelTop,
  Link2,
  PanelTopOpen,
  Server,
  ShieldCheck,
} from "lucide-react";

import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import { scanRoutesShallow } from "@/utils/route-discovery";
import { cn } from "@/lib/utils";
import type {
  FeatureAdminComponent,
  FeatureAdminDocLink,
  FeatureAdminMap,
  FeatureResourceStatus,
} from "../types/featureAdminMap";
import {
  findWindowPanelsBySlugPrefix,
  resolveOverlay,
  resolveWindowPanel,
} from "../utils/lookupOverlay";
import { ExternalTabLink, OverlayLaunchButton } from "./OverlayLaunchButton";

interface FeatureAdminPageProps {
  map: FeatureAdminMap;
}

const STATUS_STYLES: Record<FeatureResourceStatus, string> = {
  Live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Beta: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "Coming soon": "bg-muted text-muted-foreground border-border",
  Deprecated:
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  "Demo only":
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
};

const TIER_STYLES: Record<
  NonNullable<FeatureAdminComponent["tier"]>,
  string
> = {
  official:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  candidate:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  internal: "bg-muted text-muted-foreground border-border",
};

function StatusPill({ status }: { status?: FeatureResourceStatus }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function TierPill({
  tier,
}: {
  tier: NonNullable<FeatureAdminComponent["tier"]>;
}) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4",
        TIER_STYLES[tier],
      )}
      title={
        tier === "official"
          ? "Registered in the official-components registry"
          : tier === "candidate"
            ? "Official-candidate — promoted-by-use but not yet in the official registry"
            : "Internal — feature-local file path readout"
      }
    >
      {tier === "official" && <ShieldCheck className="h-2.5 w-2.5" />}
      {tier}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-baseline gap-2 mb-2 border-b border-border pb-1">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
        {title}
      </h2>
      <span className="text-[10px] text-muted-foreground/70 tabular-nums">
        {count}
      </span>
    </div>
  );
}

/**
 * Compact row used by every section. Single-line title (mono path), an
 * optional inline label, status + tier pills on the right, and an optional
 * details expander when `notes` are provided. Click the title to navigate
 * (new tab). No paragraph descriptions — admins don't need them.
 */
function ResourceRow({
  title,
  href,
  label,
  meta,
  status,
  tier,
  notes,
  rightSlot,
}: {
  title: string;
  href?: string;
  label?: string;
  meta?: React.ReactNode;
  status?: FeatureResourceStatus;
  tier?: NonNullable<FeatureAdminComponent["tier"]>;
  notes?: string[];
  rightSlot?: React.ReactNode;
}) {
  const titleEl = href ? (
    <ExternalTabLink
      href={href}
      className="font-mono text-sm text-primary hover:underline"
    >
      <span className="truncate">{title}</span>
    </ExternalTabLink>
  ) : (
    <span className="font-mono text-sm text-foreground truncate">{title}</span>
  );

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {titleEl}
          {label && (
            <span className="text-sm text-muted-foreground truncate">
              · {label}
            </span>
          )}
        </div>
        {tier && <TierPill tier={tier} />}
        <StatusPill status={status} />
        {rightSlot}
      </div>
      {meta && (
        <div className="mt-1 text-xs text-muted-foreground/80 font-mono truncate">
          {meta}
        </div>
      )}
      {notes && notes.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground select-none inline-flex items-center gap-1">
            <span className="inline-block transition-transform group-open:rotate-90">
              ▸
            </span>
            details
          </summary>
          <ul className="mt-1.5 ml-4 space-y-1 text-xs text-muted-foreground list-disc">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

async function RouteDriftWarning({
  scanPath,
  declaredUrls,
  slug,
}: {
  scanPath: string;
  declaredUrls: Set<string>;
  slug: string;
}) {
  const found = await scanRoutesShallow(scanPath);
  const drift = found.filter((name) => {
    if (name === "admin") return false;
    return !declaredUrls.has(`/${slug}/${name}`);
  });
  if (drift.length === 0) return null;
  return (
    <div className="mt-2 rounded-sm border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="font-semibold text-amber-900 dark:text-amber-200">
          Undeclared sub-routes:
        </span>
        <span className="font-mono text-amber-800/90 dark:text-amber-300/90">
          {drift.map((n) => `/${slug}/${n}`).join(", ")}
        </span>
      </div>
    </div>
  );
}

function WindowPanelDriftWarning({
  slugPrefix,
  declaredOverlayIds,
}: {
  slugPrefix: string;
  declaredOverlayIds: Set<string>;
}) {
  const found = findWindowPanelsBySlugPrefix(slugPrefix);
  const drift = found.filter(
    (entry) => !declaredOverlayIds.has(entry.overlayId),
  );
  if (drift.length === 0) return null;
  return (
    <div className="mt-2 rounded-sm border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="font-semibold text-amber-900 dark:text-amber-200">
          Undeclared windows ({slugPrefix}*):
        </span>
        <span className="font-mono text-amber-800/90 dark:text-amber-300/90">
          {drift.map((e) => `${e.slug}`).join(", ")}
        </span>
      </div>
    </div>
  );
}

/**
 * Resolve a `FeatureAdminDocLink.href` to the right open-in-new-tab target.
 * Repo-relative `.md` paths route through the DB-backed feature docs viewer.
 * External URLs pass through unchanged.
 */
function docHref(link: FeatureAdminDocLink): string {
  if (/^https?:\/\//.test(link.href)) return link.href;
  const clean = link.href.replace(/^\/+/, "");
  const segments = clean.split("/").map(encodeURIComponent).join("/");
  return `/administration/feature-docs/view/${segments}`;
}

export default async function FeatureAdminPage({ map }: FeatureAdminPageProps) {
  const status = await getCurrentUserAdminStatus();
  // Gate: admin (any level) — not super-admin. Bounce guests + non-admins
  // to home. Redirect, never throw — that's an error page, this is UX.
  if (!status || !status.isAdmin) {
    redirect("/");
  }

  const declaredRouteUrls = new Set(map.routes.map((r) => r.url));
  const declaredOverlayIds = new Set([
    ...(map.windowPanels ?? []).map((w) => w.overlayId),
    ...(map.overlays ?? []).map((o) => o.overlayId),
  ]);

  return (
    <div className="min-h-dvh bg-background w-full">
      {/* Compact header — single line + doc chips. No paragraph. */}
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs text-muted-foreground font-mono">
            /{map.slug}/admin
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <h1 className="text-sm font-bold tracking-tight">{map.name}</h1>
          <span className="text-xs text-muted-foreground capitalize">
            ({status.level ?? "admin"})
          </span>
        </div>
        <div className="flex-1" />
        {map.docs && map.docs.length > 0 && (
          <div className="flex items-center gap-2">
            {map.docs.map((doc) => (
              <ExternalTabLink
                key={doc.href}
                href={docHref(doc)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                {doc.label}
              </ExternalTabLink>
            ))}
          </div>
        )}
      </header>

      <div className="px-4 py-4 space-y-6">
        {/* Routes */}
        <section>
          <SectionHeading
            icon={Link2}
            title="Routes"
            count={map.routes.length}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {map.routes.map((route) => (
              <ResourceRow
                key={route.url}
                title={route.url}
                href={route.url}
                label={route.label}
                meta={route.filePath}
                status={route.status}
                notes={route.notes}
              />
            ))}
          </div>
          {map.routeScanPath && (
            <Suspense fallback={null}>
              <RouteDriftWarning
                scanPath={map.routeScanPath}
                declaredUrls={declaredRouteUrls}
                slug={map.slug}
              />
            </Suspense>
          )}
        </section>

        {/* Window Panels */}
        {map.windowPanels && map.windowPanels.length > 0 && (
          <section>
            <SectionHeading
              icon={LayoutPanelTop}
              title="Window Panels"
              count={map.windowPanels.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.windowPanels.map((entry) => {
                const resolved = resolveWindowPanel(entry.overlayId);
                if (!resolved) {
                  return (
                    <ResourceRow
                      key={entry.overlayId}
                      title={entry.overlayId}
                      label="(missing from registry)"
                      status="Deprecated"
                    />
                  );
                }
                return (
                  <ResourceRow
                    key={entry.overlayId}
                    title={resolved.label}
                    label={resolved.slug}
                    meta={
                      <>
                        {resolved.kind} · {resolved.instanceMode} ·{" "}
                        {resolved.mobilePresentation}
                      </>
                    }
                    status={
                      entry.status ??
                      (resolved.deprecated ? "Deprecated" : "Live")
                    }
                    rightSlot={
                      <OverlayLaunchButton
                        overlayId={entry.overlayId}
                        label={resolved.label}
                      />
                    }
                  />
                );
              })}
            </div>
            <WindowPanelDriftWarning
              slugPrefix={map.slug}
              declaredOverlayIds={declaredOverlayIds}
            />
          </section>
        )}

        {/* Overlays / Modals */}
        {map.overlays && map.overlays.length > 0 && (
          <section>
            <SectionHeading
              icon={PanelTopOpen}
              title="Modals / Sheets"
              count={map.overlays.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.overlays.map((entry) => {
                const resolved = resolveOverlay(entry.overlayId);
                if (!resolved) {
                  return (
                    <ResourceRow
                      key={entry.overlayId}
                      title={entry.overlayId}
                      label="(missing from catalogue)"
                      status="Deprecated"
                    />
                  );
                }
                return (
                  <ResourceRow
                    key={entry.overlayId}
                    title={resolved.label}
                    label={resolved.overlayId}
                    meta={resolved.instanceMode}
                    status={entry.status ?? "Live"}
                    rightSlot={
                      <OverlayLaunchButton
                        overlayId={entry.overlayId}
                        label={resolved.label}
                      />
                    }
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Components — tiered. Official + candidate get visible badges. */}
        {map.components && map.components.length > 0 && (
          <section>
            <SectionHeading
              icon={Component}
              title="Components"
              count={map.components.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.components.map((c) => {
                const tier = c.tier ?? "internal";
                const isCandidate = tier === "candidate";
                const isOfficial = tier === "official";
                // Official components are linked to the registry index;
                // candidates / internals just show the file path (no link).
                const href = isOfficial
                  ? "/administration/official-components"
                  : undefined;
                return (
                  <ResourceRow
                    key={c.filePath}
                    title={c.name}
                    href={href}
                    label={isCandidate ? "candidate" : undefined}
                    meta={c.filePath}
                    status={c.status}
                    tier={tier}
                    notes={c.notes}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* API routes */}
        {map.apiRoutes && map.apiRoutes.length > 0 && (
          <section>
            <SectionHeading
              icon={Server}
              title="API"
              count={map.apiRoutes.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.apiRoutes.map((api) => (
                <ResourceRow
                  key={api.url}
                  title={api.url}
                  label={api.method}
                  meta={api.filePath}
                />
              ))}
            </div>
          </section>
        )}

        {/* Redux slices */}
        {map.reduxSlices && map.reduxSlices.length > 0 && (
          <section>
            <SectionHeading
              icon={Database}
              title="Redux Slices"
              count={map.reduxSlices.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.reduxSlices.map((slice) => (
                <ResourceRow
                  key={slice.filePath}
                  title={slice.name}
                  meta={slice.filePath}
                />
              ))}
            </div>
          </section>
        )}

        {/* Demos / tests */}
        {map.demoRoutes && map.demoRoutes.length > 0 && (
          <section>
            <SectionHeading
              icon={FlaskConical}
              title="Demos / Tests"
              count={map.demoRoutes.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.demoRoutes.map((route) => (
                <ResourceRow
                  key={route.url}
                  title={route.url}
                  href={route.url}
                  label={route.label}
                  meta={route.filePath}
                  status={route.status ?? "Demo only"}
                />
              ))}
            </div>
          </section>
        )}

        {/* Related features */}
        {map.relatedFeatures && map.relatedFeatures.length > 0 && (
          <section>
            <SectionHeading
              icon={GitBranch}
              title="Related Features"
              count={map.relatedFeatures.length}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {map.relatedFeatures.map((rel) => (
                <ResourceRow
                  key={rel.name}
                  title={rel.name}
                  href={rel.adminUrl}
                  meta={rel.description}
                />
              ))}
            </div>
          </section>
        )}

        {/* Footer reminder — single line, mono. */}
        <footer className="pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground/70 font-mono">
            <Boxes className="inline h-3 w-3 -mt-0.5 mr-1" />
            source: hand-curated FeatureAdminMap config at{" "}
            <ExternalTabLink
              href={`/administration/feature-docs/view/app/(core)/${map.slug}/admin/page.tsx`}
              className="hover:underline text-primary"
            >
              app/(core)/{map.slug}/admin/page.tsx
            </ExternalTabLink>{" "}
            · drift warnings above flag what's missed.
          </p>
        </footer>
      </div>
    </div>
  );
}
