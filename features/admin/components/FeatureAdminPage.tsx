// features/admin/components/FeatureAdminPage.tsx
//
// Platform primitive for `/[feature]/admin`. Server component, admin-gated
// (any admin level), `force-dynamic`. Utilitarian by mandate — densest
// scannable layout we can ship, zero narration, every link new-tab, every
// window-panel card actually launches the panel.
//
// Renders a TABLE per resource family (routes, window panels, overlays,
// components, APIs, slices, demos, related). No card chrome. Each row is
// one line: link · label · path · pills · actions. Long notes are reachable
// from a single `▸` toggle that actually expands. Done.

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AlertCircle,
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
import {
  ExternalTabLink,
  OverlayLaunchButton,
} from "./OverlayLaunchButton";

interface FeatureAdminPageProps {
  map: FeatureAdminMap;
}

const STATUS_STYLES: Record<FeatureResourceStatus, string> = {
  Live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  Beta: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20",
  "Coming soon":
    "bg-muted text-muted-foreground ring-1 ring-border",
  Deprecated:
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20",
  "Demo only":
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-500/20",
};

const TIER_STYLES: Record<NonNullable<FeatureAdminComponent["tier"]>, string> = {
  official:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30",
  candidate:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30",
  internal: "bg-transparent text-muted-foreground/70 ring-1 ring-border/60",
};

function Pill({
  text,
  className,
  icon: Icon,
  title,
}: {
  text: string;
  className: string;
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium uppercase tracking-wider leading-4 whitespace-nowrap",
        className,
      )}
    >
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {text}
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
    <div className="flex items-baseline gap-2 mt-6 mb-2 px-3">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <h2 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        {title}
      </h2>
      <span className="text-[10px] text-muted-foreground/60 tabular-nums">
        {count}
      </span>
    </div>
  );
}

/**
 * Dense row. ONE line, table-style. Optional notes expand inline via a
 * single `<details>` element so the toggle actually works. Path / meta is
 * tiny mono inline, not a second line.
 */
function Row({
  href,
  primary,
  label,
  meta,
  pills,
  actions,
  notes,
}: {
  href?: string;
  primary: string;
  label?: string;
  meta?: string;
  pills?: React.ReactNode;
  actions?: React.ReactNode;
  notes?: string[];
}) {
  const primaryEl = href ? (
    <ExternalTabLink
      href={href}
      className="font-mono text-xs text-primary hover:underline truncate min-w-0"
    >
      <span className="truncate">{primary}</span>
    </ExternalTabLink>
  ) : (
    <span className="font-mono text-xs text-foreground truncate min-w-0">
      {primary}
    </span>
  );

  if (notes && notes.length > 0) {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none px-3 py-1 flex items-center gap-2 hover:bg-muted/40 border-b border-border/40">
          <span className="text-muted-foreground text-[10px] w-3 select-none group-open:rotate-90 transition-transform">
            ▸
          </span>
          {primaryEl}
          {label && (
            <span className="text-xs text-muted-foreground/80 truncate">
              {label}
            </span>
          )}
          {meta && (
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate ml-auto">
              {meta}
            </span>
          )}
          <span className="flex items-center gap-1 shrink-0">{pills}</span>
          <span className="flex items-center gap-1 shrink-0">{actions}</span>
        </summary>
        <ul className="px-3 pl-10 py-1.5 space-y-0.5 text-[11px] text-muted-foreground bg-muted/20 border-b border-border/40 list-disc">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <div className="px-3 py-1 flex items-center gap-2 hover:bg-muted/40 border-b border-border/40">
      <span className="w-3" />
      {primaryEl}
      {label && (
        <span className="text-xs text-muted-foreground/80 truncate">
          {label}
        </span>
      )}
      {meta && (
        <span className="text-[10px] text-muted-foreground/60 font-mono truncate ml-auto">
          {meta}
        </span>
      )}
      <span className="flex items-center gap-1 shrink-0">{pills}</span>
      <span className="flex items-center gap-1 shrink-0">{actions}</span>
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
    <div className="mx-3 my-1 px-2 py-1 rounded bg-amber-500/10 ring-1 ring-amber-500/30 text-xs flex items-center gap-1.5">
      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="font-semibold text-amber-900 dark:text-amber-200">
        Undeclared:
      </span>
      <span className="font-mono text-amber-800/90 dark:text-amber-300/90">
        {drift.map((n) => `/${slug}/${n}`).join(", ")}
      </span>
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
    <div className="mx-3 my-1 px-2 py-1 rounded bg-amber-500/10 ring-1 ring-amber-500/30 text-xs flex items-center gap-1.5">
      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="font-semibold text-amber-900 dark:text-amber-200">
        Undeclared windows:
      </span>
      <span className="font-mono text-amber-800/90 dark:text-amber-300/90">
        {drift.map((e) => e.slug).join(", ")}
      </span>
    </div>
  );
}

function docHref(link: FeatureAdminDocLink): string {
  if (/^https?:\/\//.test(link.href)) return link.href;
  const clean = link.href.replace(/^\/+/, "");
  return `/admin/docs/${clean}`;
}

export default async function FeatureAdminPage({ map }: FeatureAdminPageProps) {
  const status = await getCurrentUserAdminStatus();
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
      {/* Single-line header. No paragraph. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-3 py-1.5 flex items-center gap-3">
        <span className="font-mono text-[11px] text-muted-foreground shrink-0">
          /{map.slug}/admin
        </span>
        <span className="text-muted-foreground/40">·</span>
        <h1 className="text-sm font-semibold tracking-tight shrink-0">
          {map.name}
        </h1>
        <span className="text-[10px] text-muted-foreground capitalize shrink-0">
          ({status.level ?? "admin"})
        </span>
        <span className="flex-1" />
        {map.docs && map.docs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {map.docs.map((doc) => (
              <ExternalTabLink
                key={doc.href}
                href={docHref(doc)}
                className="text-[11px] text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                {doc.label}
              </ExternalTabLink>
            ))}
          </div>
        )}
        <ExternalTabLink
          href={`/admin/docs/app/(core)/${map.slug}/admin/page.tsx`}
          className="text-[10px] font-mono text-muted-foreground/70 hover:text-foreground hover:underline shrink-0"
        >
          edit map
        </ExternalTabLink>
      </header>

      <div className="w-full">
        {/* Routes */}
        <section>
          <SectionHeading icon={Link2} title="Routes" count={map.routes.length} />
          <div className="border-t border-border">
            {map.routes.map((route) => (
              <Row
                key={route.url}
                href={route.url}
                primary={route.url}
                label={route.label}
                meta={route.filePath}
                notes={route.notes}
                pills={
                  route.status ? (
                    <Pill text={route.status} className={STATUS_STYLES[route.status]} />
                  ) : null
                }
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
            <div className="border-t border-border">
              {map.windowPanels.map((entry) => {
                const resolved = resolveWindowPanel(entry.overlayId);
                if (!resolved) {
                  return (
                    <Row
                      key={entry.overlayId}
                      primary={entry.overlayId}
                      label="(missing from registry)"
                      pills={<Pill text="Deprecated" className={STATUS_STYLES.Deprecated} />}
                    />
                  );
                }
                const inferredStatus: FeatureResourceStatus =
                  entry.status ??
                  (resolved.deprecated ? "Deprecated" : "Live");
                return (
                  <Row
                    key={entry.overlayId}
                    primary={resolved.label}
                    label={resolved.slug}
                    meta={`${resolved.kind} · ${resolved.instanceMode} · ${resolved.mobilePresentation}`}
                    pills={<Pill text={inferredStatus} className={STATUS_STYLES[inferredStatus]} />}
                    actions={
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
            <div className="border-t border-border">
              {map.overlays.map((entry) => {
                const resolved = resolveOverlay(entry.overlayId);
                if (!resolved) {
                  return (
                    <Row
                      key={entry.overlayId}
                      primary={entry.overlayId}
                      label="(missing from catalogue)"
                      pills={<Pill text="Deprecated" className={STATUS_STYLES.Deprecated} />}
                    />
                  );
                }
                const s: FeatureResourceStatus = entry.status ?? "Live";
                return (
                  <Row
                    key={entry.overlayId}
                    primary={resolved.label}
                    label={resolved.overlayId}
                    meta={resolved.instanceMode}
                    pills={<Pill text={s} className={STATUS_STYLES[s]} />}
                    actions={
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

        {/* Components — tiered. */}
        {map.components && map.components.length > 0 && (
          <section>
            <SectionHeading
              icon={Component}
              title="Components"
              count={map.components.length}
            />
            <div className="border-t border-border">
              {map.components.map((c) => {
                const tier = c.tier ?? "internal";
                // Officials get a link to the registry; everything else is
                // just a path readout (no link — these aren't user-facing).
                const href =
                  tier === "official"
                    ? "/administration/official-components"
                    : undefined;
                return (
                  <Row
                    key={c.filePath}
                    href={href}
                    primary={c.name}
                    meta={c.filePath}
                    notes={c.notes}
                    pills={
                      <>
                        <Pill
                          text={tier}
                          className={TIER_STYLES[tier]}
                          icon={tier === "official" ? ShieldCheck : undefined}
                          title={
                            tier === "official"
                              ? "Registered in the official-components registry"
                              : tier === "candidate"
                                ? "components/official-candidate/ — promoted-by-use"
                                : "Feature-internal path"
                          }
                        />
                        {c.status && (
                          <Pill text={c.status} className={STATUS_STYLES[c.status]} />
                        )}
                      </>
                    }
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* API */}
        {map.apiRoutes && map.apiRoutes.length > 0 && (
          <section>
            <SectionHeading
              icon={Server}
              title="API"
              count={map.apiRoutes.length}
            />
            <div className="border-t border-border">
              {map.apiRoutes.map((api) => (
                <Row
                  key={api.url}
                  primary={api.url}
                  label={api.method}
                  meta={api.filePath}
                />
              ))}
            </div>
          </section>
        )}

        {/* Redux */}
        {map.reduxSlices && map.reduxSlices.length > 0 && (
          <section>
            <SectionHeading
              icon={Database}
              title="Redux Slices"
              count={map.reduxSlices.length}
            />
            <div className="border-t border-border">
              {map.reduxSlices.map((slice) => (
                <Row
                  key={slice.filePath}
                  primary={slice.name}
                  meta={slice.filePath}
                />
              ))}
            </div>
          </section>
        )}

        {/* Demos */}
        {map.demoRoutes && map.demoRoutes.length > 0 && (
          <section>
            <SectionHeading
              icon={FlaskConical}
              title="Demos / Tests"
              count={map.demoRoutes.length}
            />
            <div className="border-t border-border">
              {map.demoRoutes.map((route) => {
                const s: FeatureResourceStatus = route.status ?? "Demo only";
                return (
                  <Row
                    key={route.url}
                    href={route.url}
                    primary={route.url}
                    label={route.label}
                    meta={route.filePath}
                    pills={<Pill text={s} className={STATUS_STYLES[s]} />}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Related */}
        {map.relatedFeatures && map.relatedFeatures.length > 0 && (
          <section>
            <SectionHeading
              icon={GitBranch}
              title="Related Features"
              count={map.relatedFeatures.length}
            />
            <div className="border-t border-border">
              {map.relatedFeatures.map((rel) => (
                <Row
                  key={rel.name}
                  href={rel.adminUrl}
                  primary={rel.name}
                  meta={rel.description}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
