"use client";

/**
 * AppletOverviewContent — /applets/manage/[id] page body: what this Applet IS.
 *
 * Reads the Applet record from Redux (hydrated by AppletHydratorServer in the
 * layout): its identity, its pages, the jobs it runs (`mandates`, by key) and
 * the data it reads (`sources`). An Applet names jobs, never agents — a job
 * opens in place in the mandate window.
 */

import Link from "next/link";
import { MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { Badge, Button, EmptyState, RegionSkeleton, RowGroup, SettingRow } from "@ai-matrx/design-system/controls";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppById } from "@/features/agents/redux/applets/selectors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { siteConfig } from "@/config/extras/site";
import { useChangeByTalkingDisclosure } from "@/features/applets/route/useChangeByTalkingDisclosure";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { appletJobs, appletPages, appletSources } from "@/features/applets/types";
import { useSourceTableNames } from "@/features/applets/hooks/useSourceTableNames";
import { appletState, appletVersionLabel } from "@/features/applets/lib/applet-state";

/** "summarize_book" → "Summarize book": the code's name for a job, as words. */
function humanizeAlias(alias: string): string {
  const words = alias.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : alias;
}

interface AppletOverviewContentProps {
  appId: string;
}

export function AppletOverviewContent({ appId }: AppletOverviewContentProps) {
  const app = useAppSelector((state) => selectAppById(state, appId));
  const openMandate = useOpenMandateWindow();
  useChangeByTalkingDisclosure();
  const tableNames = useSourceTableNames(app ? appletSources(app).flatMap((s) => ("table_id" in s ? [s.table_id] : [])) : []);

  if (!app) {
    return (
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <RegionSkeleton shape="form" count={4} />
        </div>
      </div>
    );
  }

  const pages = appletPages(app);
  const jobs = appletJobs(app);
  const sources = appletSources(app);
  const isPublished = appletState(app).live;
  const versionLabel = appletVersionLabel(app.content_version);
  const base = `/applets/manage/${app.id}`;

  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Published / Draft is the header's; one fact, once. */}
            {versionLabel ? <Badge>{versionLabel}</Badge> : null}
          </div>
          <CopyButtons
            size="sm"
            label={app.name}
            json={() => app}
            agent={() => ({
              kind: "applet",
              location: `AI Matrx — Applet — ${app.name}`,
              description: "This Applet: pages, jobs and sources.",
              data: { id: app.id, slug: app.slug, name: app.name, version: app.content_version, pages, jobs, sources },
            })}
          />
        </div>

        {(app.tagline || app.description) && (
          <div className="space-y-1">
            {app.tagline && <p className="text-sm font-medium text-foreground">{app.tagline}</p>}
            {app.description && <p className="text-sm text-muted-foreground">{app.description}</p>}
          </div>
        )}

        {/* One door per action: Run / Code / Versions / Settings are the header's
            modes, so the body offers only what the header does not — changing
            the Applet by talking to its builder. */}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<MessageSquare />} asChild>
            <Link href={`/applets/build?applet=${app.id}`}>Change it by talking</Link>
          </Button>
        </div>

        <RowGroup title="Pages">
          {pages.length === 0 ? (
            <SettingRow label="One page" />
          ) : (
            // A page is its title; the file behind it is the code's business.
            pages.map((page) => <SettingRow key={page.path} label={page.title} />)
          )}
        </RowGroup>

        <RowGroup title="AI jobs">
          {jobs.length === 0 ? (
            <SettingRow label="No AI jobs" />
          ) : (
            jobs.map((job) => (
              <SettingRow key={job.alias} label={humanizeAlias(job.alias)}>
                <Button
                  variant="quiet"
                  onClick={() =>
                    openMandate({
                      initialMandateKey: storedMandateKey(job.key),
                      mandateKeys: jobs.map((j) => storedMandateKey(j.key)),
                    })
                  }
                >
                  Open job
                </Button>
              </SettingRow>
            ))
          )}
        </RowGroup>

        <RowGroup title="Data">
          {sources.length === 0 ? (
            <EmptyState icon={<SettingsIcon />} title="No data" />
          ) : (
            sources.map((source) => {
              // The real table in words — never the code's alias alone (2026-10-07 audit: "books" hid a
              // blank table of another organization).
              const table = "table_id" in source ? tableNames[source.table_id] : undefined;
              const otherOrg = "table_id" in source && source.organization_id !== app.organization_id;
              // Names still loading: a skeleton, never the alias ("posts") for a moment.
              if ("table_id" in source && !table) return <RegionSkeleton key={source.alias} shape="rows" count={1} />;
              return (
              <SettingRow
                key={source.alias}
                label={"new_table" in source ? source.new_table.name : "entity" in source ? humanizeAlias(source.entity) : (table?.name ?? "")}
                line={
                  "entity" in source
                    ? `Record type: ${source.entity}`
                    : "new_table" in source
                      ? "New table · made by Use it"
                      : `${otherOrg ? "Another organization's table" : "Table"}${table?.organizationName ? ` · ${table.organizationName}` : ""}`
                }
              >
                {"table_id" in source && (
                  <Button variant="quiet" asChild>
                    <Link href={`/data/${source.table_id}`}>Open table</Link>
                  </Button>
                )}
              </SettingRow>
              );
            })
          )}
        </RowGroup>

        <RowGroup title="Activity">
          <SettingRow label="Updated" line={formatRelativeTime(app.updated_at)} />
          {isPublished && (
            <SettingRow label="Public link">
              <Button variant="quiet" asChild>
                <a href={`${siteConfig.url}/applets/${app.slug}`} target="_blank" rel="noopener noreferrer">
                  /applets/{app.slug}
                </a>
              </Button>
            </SettingRow>
          )}
        </RowGroup>
      </div>
    </div>
  );
}
