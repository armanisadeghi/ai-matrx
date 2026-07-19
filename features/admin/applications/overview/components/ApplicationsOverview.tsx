"use client";

// features/admin/applications/overview/components/ApplicationsOverview.tsx
//
// Overview tab of the Applications hub — one card per shipped application,
// summarising the three governed systems (remote configuration, remote
// catalogs, installed fleet) with real numbers and a direct link into the tab
// that owns each one.
//
// The loud bit: when any installed instance reports a version below the
// application's published min_supported_app_version, this surface names the
// count in a destructive banner. A fleet running unsupported builds is an
// operational fact that must never be a number you have to go looking for.

import { useMemo } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronRight,
  HardDrive,
  LibraryBig,
  MonitorCog,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { versionStanding } from "@/features/admin/applications/version";
import type { AppConfigRow } from "@/features/admin/applications/config/types";
import type { CatalogEntryRow } from "@/features/admin/applications/catalogs/types";
import type { AppInstanceRow } from "@/features/admin/applications/installations/types";

interface ApplicationsOverviewProps {
  configRows: AppConfigRow[];
  catalogRows: CatalogEntryRow[];
  instanceRows: AppInstanceRow[];
  /** Application the installed fleet belongs to (app_instances is single-app). */
  instancesApp: string;
  /** Render-stable "now" from the server page — keeps the 7-day activity
   *  window deterministic and free of a hydration mismatch. */
  nowMs: number;
}

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const URL_KEYS = ["server_url", "ws_url", "assets_url"] as const;

function readConfigObject(config: unknown): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionLink({
  href,
  icon: Icon,
  title,
  children,
}: {
  href: string;
  icon: typeof MonitorCog;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent/50"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-sm font-medium">{title}</div>
        {children}
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function ApplicationsOverview({
  configRows,
  catalogRows,
  instanceRows,
  instancesApp,
  nowMs,
}: ApplicationsOverviewProps) {
  // Every application we know about: one that has config, catalogs, or a fleet.
  const apps = useMemo(() => {
    const slugs = new Set<string>([
      ...configRows.map((r) => r.app),
      ...catalogRows.map((r) => r.app),
    ]);
    if (instanceRows.length > 0) slugs.add(instancesApp);
    return Array.from(slugs).sort((a, b) => a.localeCompare(b));
  }, [configRows, catalogRows, instanceRows, instancesApp]);

  const summaries = useMemo(() => {
    const cutoff = nowMs - ACTIVE_WINDOW_MS;
    return apps.map((app) => {
      const config = configRows.find((r) => r.app === app) ?? null;
      const configObj = readConfigObject(config?.config);
      const urls = URL_KEYS.map((key) => ({
        key,
        value: typeof configObj[key] === "string" ? (configObj[key] as string) : null,
      }));
      const flags =
        configObj.flags &&
        typeof configObj.flags === "object" &&
        !Array.isArray(configObj.flags)
          ? (configObj.flags as Record<string, unknown>)
          : {};
      const activeFlags = Object.values(flags).filter(
        (v) => v === true,
      ).length;
      const notice =
        configObj.notice &&
        typeof configObj.notice === "object" &&
        !Array.isArray(configObj.notice)
          ? (configObj.notice as Record<string, unknown>)
          : null;
      const noticeLive = Boolean(notice && notice.enabled === true);

      const appCatalog = catalogRows.filter((r) => r.app === app);
      const kinds = new Set(appCatalog.map((r) => r.kind));
      const activeEntries = appCatalog.filter((r) => r.is_active).length;

      const fleet = app === instancesApp ? instanceRows : [];
      const recent = fleet.filter(
        (r) => r.last_seen && new Date(r.last_seen).getTime() >= cutoff,
      ).length;
      const minVersion = config?.min_supported_app_version ?? null;
      let below = 0;
      let unknown = 0;
      const versions = new Map<string, number>();
      for (const row of fleet) {
        const standing = versionStanding(row.app_version, minVersion);
        if (standing === "below") below += 1;
        if (standing === "unknown") unknown += 1;
        const label = row.app_version ?? "not reported";
        versions.set(label, (versions.get(label) ?? 0) + 1);
      }

      return {
        app,
        config,
        urls,
        activeFlags,
        totalFlags: Object.keys(flags).length,
        noticeLive,
        minVersion,
        catalogTotal: appCatalog.length,
        catalogActive: activeEntries,
        catalogKinds: kinds.size,
        fleetTotal: fleet.length,
        fleetRecent: recent,
        fleetBelow: below,
        fleetUnknown: unknown,
        versionSpread: Array.from(versions.entries()).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        ),
      };
    });
  }, [apps, configRows, catalogRows, instanceRows, instancesApp, nowMs]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4">
        <h1 className="text-base font-semibold">Applications</h1>
        <p className="text-xs text-muted-foreground">
          Shipped client applications — desktop, extension, mobile. Remote
          configuration, catalogs, and the installed fleet.
        </p>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
          No applications configured yet — create a configuration row on the
          Configuration tab.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {summaries.map((s) => (
          <section
            key={s.app}
            className="rounded-md border border-border bg-card/50 p-3"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <code className="text-sm font-semibold">{s.app}</code>
              {s.config ? (
                <Badge variant="outline">
                  schema v{s.config.schema_version}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  no configuration row
                </Badge>
              )}
              {s.minVersion ? (
                <Badge variant="outline" className="font-mono">
                  min {s.minVersion}
                </Badge>
              ) : null}
              {s.noticeLive ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  notice live
                </Badge>
              ) : null}
              {s.config ? (
                <span
                  className="ml-auto text-xs text-muted-foreground"
                  title={format(
                    new Date(s.config.updated_at),
                    "yyyy-MM-dd HH:mm:ss",
                  )}
                >
                  updated{" "}
                  {formatDistanceToNow(new Date(s.config.updated_at), {
                    addSuffix: true,
                  })}
                </span>
              ) : null}
            </div>

            {s.fleetBelow > 0 ? (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{s.fleetBelow}</strong> installed{" "}
                  {s.fleetBelow === 1 ? "instance is" : "instances are"} below
                  the minimum supported version{" "}
                  <code className="font-mono">{s.minVersion}</code>.{" "}
                  <Link
                    href="/administration/applications/installations"
                    className="underline underline-offset-2"
                  >
                    Review the fleet
                  </Link>
                  .
                </span>
              </div>
            ) : null}

            <div className="space-y-2">
              <SectionLink
                href="/administration/applications/configuration"
                icon={MonitorCog}
                title="Configuration"
              >
                {s.config ? (
                  <div className="space-y-1">
                    {s.urls.map((u) => (
                      <div
                        key={u.key}
                        className="flex items-baseline gap-2 text-xs"
                      >
                        <span className="w-20 shrink-0 text-muted-foreground">
                          {u.key}
                        </span>
                        <code className="truncate">
                          {u.value ?? (
                            <span className="text-muted-foreground">
                              not set
                            </span>
                          )}
                        </code>
                      </div>
                    ))}
                    <div className="pt-1 text-xs text-muted-foreground">
                      {s.activeFlags} of {s.totalFlags} flag
                      {s.totalFlags === 1 ? "" : "s"} enabled ·{" "}
                      {s.noticeLive ? "notice live" : "no live notice"}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No configuration row — installed clients fall back to their
                    built-in defaults.
                  </p>
                )}
              </SectionLink>

              <SectionLink
                href="/administration/applications/catalogs"
                icon={LibraryBig}
                title="Catalogs"
              >
                <div className="flex flex-wrap gap-4">
                  <Stat label="Entries" value={s.catalogTotal} />
                  <Stat label="Active" value={s.catalogActive} />
                  <Stat label="Kinds" value={s.catalogKinds} />
                </div>
              </SectionLink>

              <SectionLink
                href="/administration/applications/installations"
                icon={HardDrive}
                title="Installations"
              >
                {s.fleetTotal === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No installed instances have checked in for this
                    application.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <Stat label="Instances" value={s.fleetTotal} />
                      <Stat label="Active last 7d" value={s.fleetRecent} />
                      <Stat label="Below min" value={s.fleetBelow} />
                      <Stat label="Unreported" value={s.fleetUnknown} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.versionSpread.map(([label, count]) => (
                        <Badge
                          key={label}
                          variant="outline"
                          className="text-[10px] font-mono text-muted-foreground"
                        >
                          {label} × {count}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </SectionLink>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
