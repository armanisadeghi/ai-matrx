"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle,
  Globe,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stars,
  Star,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { AgentAppsGrid } from "@/features/agent-apps/components/layouts/AgentAppsGrid";
import {
  fetchAgentAppCategories,
  fetchAgentAppsAdmin,
  type AgentAppAdminView,
  type AgentAppCategoryRow,
} from "@/lib/services/agent-apps-admin-service";

const TILES = [
  {
    href: "/administration/agent-apps/apps",
    label: "Apps",
    description:
      "Every agent app across the platform: filter, feature, verify, moderate.",
    icon: Boxes,
    key: "apps" as const,
  },
  {
    href: "/administration/agent-apps/categories",
    label: "Categories",
    description:
      "Manage the static list of agent-app categories shown in public browsing.",
    icon: Tag,
    key: "categories" as const,
  },
  {
    href: "/administration/agent-apps/executions",
    label: "Executions",
    description:
      "Recent runs and errors across every agent app. Resolve incidents, see usage.",
    icon: Activity,
    key: "executions" as const,
  },
];

export default function AgentAppsAdminDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [categories, setCategories] = useState<AgentAppCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        fetchAgentAppsAdmin({ limit: 500 }),
        fetchAgentAppCategories(),
      ]);
      setApps(a);
      setCategories(c);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load agent apps",
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

  const featuredApps = apps
    .filter((a) => a.is_featured && a.status === "published")
    .slice(0, 6);

  const recentlyUpdated = [...apps]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 6);

  const handleNavigate = (href: string) => {
    if (isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  const getAppHref = (app: { id: string }) =>
    `/administration/agent-apps/edit/${app.id}`;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Agent Apps Admin
              </h1>
              <p className="text-sm text-muted-foreground">
                Managing{" "}
                <Badge variant="outline" className="ml-0.5 text-[11px]">
                  platform-wide
                </Badge>{" "}
                apps. Every user&apos;s public apps are visible here.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{counts.apps}</div>
                <div className="text-xs text-muted-foreground">Total Apps</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-success flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  {published}
                </div>
                <div className="text-xs text-muted-foreground">Published</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-warning flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  {featured}
                </div>
                <div className="text-xs text-muted-foreground">Featured</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-primary flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  {verified}
                </div>
                <div className="text-xs text-muted-foreground">Verified</div>
              </CardContent>
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
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          {navigating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {count.toLocaleString()}
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
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Star className="h-4 w-4 text-warning" />
                Featured apps
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  handleNavigate("/administration/agent-apps/apps")
                }
              >
                See all
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            {loading ? (
              <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading featured apps…
              </div>
            ) : featuredApps.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                  <Stars className="h-3.5 w-3.5" />
                  No featured apps yet. Feature an app from the apps list to
                  highlight it.
                </CardContent>
              </Card>
            ) : (
              <AgentAppsGrid
                apps={featuredApps as any}
                hrefFor={getAppHref}
                emptyLabel="No featured apps."
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" />
                Recently updated
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  handleNavigate("/administration/agent-apps/apps")
                }
              >
                See all
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            {loading ? (
              <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading…
              </div>
            ) : (
              <AgentAppsGrid
                apps={recentlyUpdated as any}
                hrefFor={getAppHref}
                emptyLabel="No agent apps yet."
              />
            )}
          </div>

          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1.5">
              <div className="font-medium text-foreground">
                About agent-app administration
              </div>
              <p>
                This surface aggregates every agent-backed public app on the
                platform. Use it to feature, verify, moderate, and override rate
                limits. Individual owners manage their own apps from the
                authenticated agent-apps route; this admin surface is the
                superset across all owners.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
