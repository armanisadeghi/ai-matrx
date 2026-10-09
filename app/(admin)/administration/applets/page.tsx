"use client";

import AppLink from "@/components/navigation/AppLink";
import React, { useCallback, useEffect, useState, useTransition } from "react";
import { UntrustedCount } from "@ai-matrx/design-system";
import { readOf } from "@ai-matrx/design-system";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stars,
  Star,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ReadFailure } from "@ai-matrx/design-system";
import {
  fetchAppletCategories,
  fetchAppletsAdmin,
  type AppletAdminView,
  type AppletCategoryRow,
} from "@/lib/services/applets-admin-service";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLETS_SURFACE_NAME,
  createAdminAppletsScope,
} from "@/features/surfaces/manifests/admin-applets.manifest";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { appBrief, humanApplet } from "@/features/applets/format";

const TILES = [
  {
    href: "/administration/applets/all",
    label: "System Applets",
    description:
      "The platform's own Applets: feature, verify, publish.",
    icon: Boxes,
    key: "apps" as const,
  },
  {
    href: "/administration/applets/categories",
    label: "Categories",
    description:
      "The category list shown in public Applet browsing.",
    icon: Tag,
    key: "categories" as const,
  },
  {
    href: "/administration/applets/executions",
    label: "Executions",
    description:
      "Runs and errors (count: system Applets).",
    icon: Activity,
    key: "executions" as const,
  },
];

export default function AppletsAdminDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const [apps, setApps] = useState<AppletAdminView[]>([]);
  const [categories, setCategories] = useState<AppletCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        // Management seat: the platform's own Applets only (admin-seat rule, Arman 2026-09-26).
        // Organizations' and people's Applets live at /administration/applets/support.
        fetchAppletsAdmin({ scope: "global", limit: 500 }),
        fetchAppletCategories(),
      ]);
      setApps(a);
      setCategories(c);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load Applets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = {
    apps: apps.length,
    categories: categories.length,
    executions: apps.reduce((s, a) => s + (a.total_executions ?? 0), 0),
  };

  const published = apps.filter((a) => a.status === "published").length;
  const featured = apps.filter((a) => a.is_featured).length;
  const verified = apps.filter((a) => a.is_verified).length;

  const allFeaturedApps = apps.filter(
    (a) => a.is_featured && a.status === "published",
  );
  const featuredApps = showAllFeatured
    ? allFeaturedApps
    : allFeaturedApps.slice(0, 6);

  const allRecentlyUpdated = [...apps].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  const recentlyUpdated = showAllRecent
    ? allRecentlyUpdated
    : allRecentlyUpdated.slice(0, 6);

  const handleNavigate = (href: string) => {
    if (isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  const getAppHref = (app: { id: string }) =>
    `/administration/applets/edit/${app.id}`;

  const getScope = () =>
    createAdminAppletsScope({
      admin_section: "dashboard",
      dashboard_total_apps: counts.apps,
      dashboard_published_count: published,
      dashboard_featured_count: featured,
      dashboard_verified_count: verified,
      dashboard_featured_apps: featuredApps.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        status: a.status,
      })),
      dashboard_recent_apps: recentlyUpdated.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        status: a.status,
      })),
    });

  // Counts come from the apps read: "—" when it failed, last known when a refresh failed.
  const appsRead = readOf({ loading, error: loadError, hasData: apps.length > 0 });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLETS_SURFACE_NAME}
      getScope={getScope}
    >
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card">
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <Button
            icon={<RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />}
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="group/x relative">
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{counts.apps}</div>
                <div className="text-xs text-muted-foreground">System Applets</div>
              </CardContent>
              <CopyButtons
                size="xs"
                label="System Applets"
                className="absolute top-2 right-2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                human={() => `System Applets: ${counts.apps}`}
                agent={() => ({
                  kind: "applet-analytics-stat",
                  location: "AI Matrx Admin — Applets — Dashboard",
                  description: "The total-apps stat card.",
                  data: { totalApps: counts.apps },
                })}
              />
            </Card>
            <Card className="group/x relative">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-success flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  {published}
                </div>
                <div className="text-xs text-muted-foreground">Published</div>
              </CardContent>
              <CopyButtons
                size="xs"
                label="Published Applets"
                className="absolute top-2 right-2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                human={() => `Published Applets: ${published}`}
                agent={() => ({
                  kind: "applet-analytics-stat",
                  location: "AI Matrx Admin — Applets — Dashboard",
                  description: "The published-apps stat card.",
                  data: { published },
                })}
              />
            </Card>
            <Card className="group/x relative">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-warning flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  {featured}
                </div>
                <div className="text-xs text-muted-foreground">Featured</div>
              </CardContent>
              <CopyButtons
                size="xs"
                label="Featured Applets"
                className="absolute top-2 right-2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                human={() => `Featured Applets: ${featured}`}
                agent={() => ({
                  kind: "applet-analytics-stat",
                  location: "AI Matrx Admin — Applets — Dashboard",
                  description: "The featured-apps stat card.",
                  data: { featured },
                })}
              />
            </Card>
            <Card className="group/x relative">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-primary flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  {verified}
                </div>
                <div className="text-xs text-muted-foreground">Verified</div>
              </CardContent>
              <CopyButtons
                size="xs"
                label="Verified Applets"
                className="absolute top-2 right-2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                human={() => `Verified Applets: ${verified}`}
                agent={() => ({
                  kind: "applet-analytics-stat",
                  location: "AI Matrx Admin — Applets — Dashboard",
                  description: "The verified-apps stat card.",
                  data: { verified },
                })}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              const navigating = isPending && pendingHref === tile.href;
              const count = counts[tile.key];
              return (
                <button
                  key={tile.href}
                  type="button"
                  onClick={() => handleNavigate(tile.href)}
                  disabled={isPending}
                  className="text-left group focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary-ink flex items-center justify-center">
                          {navigating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          <UntrustedCount read={appsRead} label="Applets" value={count.toLocaleString()} />
                        </Badge>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-foreground font-medium group-hover:text-primary transition-colors">
                          {tile.label}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {tile.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Star className="h-4 w-4 text-warning" />
                Featured Applets
                <span className="text-xs font-normal text-muted-foreground">
                  (showing{" "}
                  <UntrustedCount read={appsRead} label="Featured Applets shown" value={featuredApps.length} />{" "}
                  of{" "}
                  <UntrustedCount read={appsRead} label="Featured Applets" value={allFeaturedApps.length} />)
                </span>
              </h2>
              <div className="flex items-center gap-1.5">
                {allFeaturedApps.length > 6 && (
                  <Button
                    variant="quiet"
                    onClick={() => setShowAllFeatured((v) => !v)}
                  >
                    {showAllFeatured
                      ? "Show top 6"
                      : `Show all ${allFeaturedApps.length}`}
                  </Button>
                )}
                {allFeaturedApps.length > 0 && (
                  <CopyButtons
                    size="icon"
                    // read-gate-exempt: copy-button label counting the rows it copies; rendered only when there are some
                    label={`Featured Applets (${allFeaturedApps.length})`}
                    human={() => allFeaturedApps.map(humanApplet).join("\n\n")}
                    json={() => allFeaturedApps}
                    agent={() => ({
                      kind: "applets",
                      location: "AI Matrx Admin — Applets — Dashboard",
                      description: "Every featured, published Applet (not just the top 6 shown).",
                      data: allFeaturedApps,
                      attributes: { count: allFeaturedApps.length },
                      context: { shown: featuredApps.length, total: allFeaturedApps.length },
                    })}
                    aiVariants={[
                      {
                        id: "briefs",
                        label: "Briefs",
                        hint: "One line per featured Applet",
                        build: () => ({
                          kind: "applets-briefs",
                          location: "AI Matrx Admin — Applets — Dashboard",
                          description: "One-line briefs for every featured app.",
                          data: allFeaturedApps.map(appBrief),
                          attributes: { count: allFeaturedApps.length },
                        }),
                      },
                    ]}
                  />
                )}
                <Button
                  iconEnd={<ArrowRight />}
                  variant="quiet"
                  onClick={() =>
                    handleNavigate("/administration/applets/all")
                  }
                >
                  See all
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading featured Applets…
              </div>
            ) : loadError && apps.length === 0 ? (
              <ReadFailure
                error={loadError}
                what="the Applets"
                onRetry={() => void load()}
              />
            ) : featuredApps.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                  <Stars className="h-3.5 w-3.5" />
                  No featured Applets yet. Feature one from System Applets to
                  highlight it.
                </CardContent>
              </Card>
            ) : (
              <AdminAppletGrid
                apps={featuredApps}
                hrefFor={getAppHref}
                emptyLabel="No featured Applets."
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" />
                Recently updated
                <span className="text-xs font-normal text-muted-foreground">
                  (showing{" "}
                  <UntrustedCount read={appsRead} label="Recent Applets shown" value={recentlyUpdated.length} />{" "}
                  of{" "}
                  <UntrustedCount read={appsRead} label="Recently updated Applets" value={allRecentlyUpdated.length} />)
                </span>
              </h2>
              <div className="flex items-center gap-1.5">
                {allRecentlyUpdated.length > 6 && (
                  <Button
                    variant="quiet"
                    onClick={() => setShowAllRecent((v) => !v)}
                  >
                    {showAllRecent
                      ? "Show top 6"
                      : `Show all ${allRecentlyUpdated.length}`}
                  </Button>
                )}
                {allRecentlyUpdated.length > 0 && (
                  <CopyButtons
                    size="icon"
                    // read-gate-exempt: copy-button label counting the rows it copies; rendered only when there are some
                    label={`Recently updated Applets (${allRecentlyUpdated.length})`}
                    human={() =>
                      allRecentlyUpdated.map(humanApplet).join("\n\n")
                    }
                    json={() => allRecentlyUpdated}
                    agent={() => ({
                      kind: "applets",
                      location: "AI Matrx Admin — Applets — Dashboard",
                      description: "Every system Applet, newest first.",
                      data: allRecentlyUpdated,
                      attributes: { count: allRecentlyUpdated.length },
                      context: { shown: recentlyUpdated.length, total: allRecentlyUpdated.length },
                    })}
                    aiVariants={[
                      {
                        id: "briefs",
                        label: "Briefs",
                        hint: "One line per Applet",
                        build: () => ({
                          kind: "applets-briefs",
                          location: "AI Matrx Admin — Applets — Dashboard",
                          description: "One-line briefs, most recently updated first.",
                          data: allRecentlyUpdated.map(appBrief),
                          attributes: { count: allRecentlyUpdated.length },
                        }),
                      },
                    ]}
                  />
                )}
                <Button
                  iconEnd={<ArrowRight />}
                  variant="quiet"
                  onClick={() =>
                    handleNavigate("/administration/applets/all")
                  }
                >
                  See all
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading…
              </div>
            ) : loadError && apps.length === 0 ? (
              <ReadFailure
                error={loadError}
                what="the Applets"
                onRetry={() => void load()}
              />
            ) : (
              <AdminAppletGrid
                apps={recentlyUpdated}
                hrefFor={getAppHref}
                emptyLabel="No Applets yet."
              />
            )}
          </div>

          {/* Admin view over every agent-backed public app; owners manage their own from the applets route. */}
        </div>
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}

/** A compact grid of Applets for this console: name, tagline, runs; each opens its admin page. */
function AdminAppletGrid({
  apps,
  hrefFor,
  emptyLabel,
}: {
  apps: AppletAdminView[];
  hrefFor: (app: AppletAdminView) => string;
  emptyLabel: string;
}) {
  if (apps.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((app) => (
        <AppLink
          key={app.id}
          href={hrefFor(app)}
          className="flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-4 hover:border-primary/40"
        >
          <span className="truncate text-sm font-semibold text-foreground">{app.name}</span>
          {app.tagline && <span className="truncate text-xs text-muted-foreground">{app.tagline}</span>}
          <span className="mt-auto pt-2 text-xs text-muted-foreground">
            {app.total_executions ?? 0} runs
            {app.job_keys.length > 0 ? ` · ${app.job_keys.length} job${app.job_keys.length === 1 ? "" : "s"}` : ""}
          </span>
        </AppLink>
      ))}
    </div>
  );
}
