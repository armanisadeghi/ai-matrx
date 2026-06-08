// features/admin/components/FeatureAdminPage.tsx
//
// The platform primitive every feature's admin map renders through.
// Server component. Super-admin gated (redirects guests + non-admins
// to home; never throws). Renders one section per resource family
// (routes, window panels, overlays, components, APIs, slices, demos,
// related features) — utilitarian, not designed. The goal is
// completeness, not polish: the admin page is the place where a
// reader can SEE everything a feature owns, including the pieces
// that aren't surfaced anywhere else in the product (window panels,
// official-candidate components, scattered demos).
//
// Adding a new feature admin map: write the config (a
// `FeatureAdminMap` object), then render
// `<FeatureAdminPage map={...} />` from `app/(core)/[feature]/admin/
// page.tsx`. That's it.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AlertCircle,
  Component,
  Database,
  ExternalLink,
  FileCode,
  FileText,
  FlaskConical,
  GitBranch,
  LayoutPanelTop,
  Link2,
  PanelTopOpen,
  Server,
} from "lucide-react";

import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import { scanRoutesShallow } from "@/utils/route-discovery";
import { cn } from "@/lib/utils";
import type {
  FeatureAdminMap,
  FeatureResourceStatus,
} from "../types/featureAdminMap";
import {
  findWindowPanelsBySlugPrefix,
  resolveOverlay,
  resolveWindowPanel,
} from "../utils/lookupOverlay";

interface FeatureAdminPageProps {
  map: FeatureAdminMap;
}

const STATUS_STYLES: Record<FeatureResourceStatus, string> = {
  Live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Beta: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "Coming soon":
    "bg-muted text-muted-foreground border-border",
  Deprecated:
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  "Demo only":
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
};

function StatusPill({ status }: { status?: FeatureResourceStatus }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  count,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          ({count})
        </span>
      </div>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function ResourceCard({
  href,
  title,
  description,
  meta,
  status,
}: {
  href?: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  status?: FeatureResourceStatus;
}) {
  const inner = (
    <div className="rounded-md border border-border bg-card p-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-foreground truncate">
              {title}
            </span>
            {href && (
              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              {description}
            </p>
          )}
          {meta && (
            <div className="mt-1.5 text-[10px] text-muted-foreground/80 font-mono">
              {meta}
            </div>
          )}
        </div>
        <StatusPill status={status} />
      </div>
    </div>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block">
      {inner}
    </Link>
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
  // Anything in `found` that doesn't appear as a declared route under
  // `/[slug]/<name>` is undeclared drift.
  const drift = found.filter((name) => {
    if (name === "admin") return false; // The admin page itself
    return !declaredUrls.has(`/${slug}/${name}`);
  });
  if (drift.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Undeclared sub-routes found
          </div>
          <p className="text-amber-800/80 dark:text-amber-300/80 mb-1.5">
            These sub-routes exist on disk but aren&apos;t listed under
            Routes. Either declare them or relocate.
          </p>
          <ul className="space-y-0.5">
            {drift.map((name) => (
              <li key={name} className="font-mono">
                /{slug}/{name}
              </li>
            ))}
          </ul>
        </div>
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
  const drift = found.filter((entry) => !declaredOverlayIds.has(entry.overlayId));
  if (drift.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Undeclared window panels with matching slug prefix
          </div>
          <p className="text-amber-800/80 dark:text-amber-300/80 mb-1.5">
            Registry entries whose slug starts with{" "}
            <code className="font-mono">{slugPrefix}</code> but aren&apos;t
            in this map. Add to <code>windowPanels</code> or rename the slug.
          </p>
          <ul className="space-y-0.5">
            {drift.map((entry) => (
              <li key={entry.overlayId} className="font-mono">
                {entry.slug} ({entry.overlayId})
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default async function FeatureAdminPage({ map }: FeatureAdminPageProps) {
  const status = await getCurrentUserAdminStatus();

  // Gate: super-admin only. Bounce everyone else to /. Throwing would
  // mean an error page; redirect is cleaner UX for guests and non-admins
  // who land here through a stray link.
  if (!status || status.level !== "super_admin") {
    redirect("/");
  }

  const declaredRouteUrls = new Set(map.routes.map((r) => r.url));
  const declaredOverlayIds = new Set([
    ...(map.windowPanels ?? []).map((w) => w.overlayId),
    ...(map.overlays ?? []).map((o) => o.overlayId),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Header */}
      <header className="border-b border-border pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link href="/" className="hover:underline">
            /
          </Link>
          <span>›</span>
          <span className="font-mono">{map.slug}</span>
          <span>›</span>
          <span className="font-mono font-semibold text-foreground">admin</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {map.name} — Feature Admin Map
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
          {map.description}
        </p>
        {map.docs && map.docs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {map.docs.map((doc) => (
              <Link
                key={doc.href}
                href={doc.href}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                {doc.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Routes */}
      <section>
        <SectionHeading
          icon={Link2}
          title="Core Routes"
          count={map.routes.length}
          description="Pages users navigate to. Use these to confirm the full set of URLs that ship for this feature."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {map.routes.map((route) => (
            <ResourceCard
              key={route.url}
              href={route.url}
              title={route.url}
              description={`${route.label} — ${route.description}`}
              meta={route.filePath}
              status={route.status}
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
            description="Floating / draggable workspace surfaces owned by this feature. Open via the overlay controller."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.windowPanels.map((entry) => {
              const resolved = resolveWindowPanel(entry.overlayId);
              if (!resolved) {
                return (
                  <ResourceCard
                    key={entry.overlayId}
                    title={entry.overlayId}
                    description="MISSING from window registry — id is declared here but no metadata entry exists"
                    status="Deprecated"
                  />
                );
              }
              return (
                <ResourceCard
                  key={entry.overlayId}
                  title={resolved.label}
                  description={entry.description}
                  meta={
                    <>
                      slug: {resolved.slug} · kind: {resolved.kind} · mode:{" "}
                      {resolved.instanceMode} · mobile:{" "}
                      {resolved.mobilePresentation}
                    </>
                  }
                  status={
                    entry.status ??
                    (resolved.deprecated ? "Deprecated" : "Live")
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
            title="Modals / Sheets / Overlays"
            count={map.overlays.length}
            description="Non-window overlays — modals, sheets, command palettes, toasts the feature ships."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.overlays.map((entry) => {
              const resolved = resolveOverlay(entry.overlayId);
              if (!resolved) {
                return (
                  <ResourceCard
                    key={entry.overlayId}
                    title={entry.overlayId}
                    description="MISSING from overlay catalogue — id is declared here but no metadata entry exists"
                    status="Deprecated"
                  />
                );
              }
              return (
                <ResourceCard
                  key={entry.overlayId}
                  title={resolved.label}
                  description={entry.description}
                  meta={`id: ${resolved.overlayId} · mode: ${resolved.instanceMode}`}
                  status={entry.status ?? "Live"}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Components */}
      {map.components && map.components.length > 0 && (
        <section>
          <SectionHeading
            icon={Component}
            title="Modules / Components"
            count={map.components.length}
            description="Reusable building blocks the feature exposes. Includes official-candidate and feature-internal components."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.components.map((c) => (
              <ResourceCard
                key={c.filePath}
                title={c.name}
                description={c.description}
                meta={c.filePath}
                status={c.status}
              />
            ))}
          </div>
        </section>
      )}

      {/* API routes */}
      {map.apiRoutes && map.apiRoutes.length > 0 && (
        <section>
          <SectionHeading
            icon={Server}
            title="API Routes"
            count={map.apiRoutes.length}
            description="Next.js API handlers this feature relies on (or owns)."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.apiRoutes.map((api) => (
              <ResourceCard
                key={api.url}
                title={`${api.method} ${api.url}`}
                description={api.description}
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
            description="Global state owned by this feature."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.reduxSlices.map((slice) => (
              <ResourceCard
                key={slice.filePath}
                title={slice.name}
                description={slice.description}
                meta={slice.filePath}
              />
            ))}
          </div>
        </section>
      )}

      {/* Demo / test routes */}
      {map.demoRoutes && map.demoRoutes.length > 0 && (
        <section>
          <SectionHeading
            icon={FlaskConical}
            title="Demos / Tests"
            count={map.demoRoutes.length}
            description="Demo, test, and playground routes related to this feature — anywhere in the repo."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.demoRoutes.map((route) => (
              <ResourceCard
                key={route.url}
                href={route.url}
                title={route.url}
                description={`${route.label} — ${route.description}`}
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
            description="Other features this one shares concepts, data, or surfaces with."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {map.relatedFeatures.map((rel) => (
              <ResourceCard
                key={rel.name}
                href={rel.adminUrl}
                title={rel.name}
                description={rel.description}
                meta={rel.adminUrl}
              />
            ))}
          </div>
        </section>
      )}

      {/* Footer reminder */}
      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <FileCode className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium text-foreground">Source of truth:</span>{" "}
            this map is generated from a hand-curated{" "}
            <code className="font-mono">FeatureAdminMap</code> config.
            When you add a route, window panel, overlay, or component to{" "}
            <code className="font-mono">features/{map.slug}/</code>, also
            append it here. The yellow drift warnings above will flag
            anything you forgot.
          </div>
        </div>
      </footer>
    </div>
  );
}
