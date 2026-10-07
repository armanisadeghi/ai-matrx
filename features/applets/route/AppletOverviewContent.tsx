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
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { appletJobs, appletPages, appletSources } from "@/features/applets/types";

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
  const isPublished = app.status === "published" && app.published_to_web;
  const base = `/applets/manage/${app.id}`;

  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Published / Draft is the header's; one fact, once. */}
            <Badge>{`Version ${app.version}`}</Badge>
          </div>
          <CopyButtons
            size="sm"
            label={app.name}
            json={() => app}
            agent={() => ({
              kind: "applet",
              location: `AI Matrx — Applet — ${app.name}`,
              description: "This Applet: pages, jobs and sources.",
              data: { id: app.id, slug: app.slug, name: app.name, version: app.version, pages, jobs, sources },
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

        <RowGroup title="Jobs">
          {jobs.length === 0 ? (
            <SettingRow label="No jobs" />
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

        <RowGroup title="Sources">
          {sources.length === 0 ? (
            <EmptyState icon={<SettingsIcon />} title="No sources" />
          ) : (
            sources.map((source) => (
              <SettingRow
                key={source.alias}
                label={source.alias}
                line={"entity" in source ? `Record type: ${source.entity}` : "Table"}
              >
                {"table_id" in source && (
                  <Button variant="quiet" asChild>
                    <Link href={`/data/${source.table_id}`}>Open table</Link>
                  </Button>
                )}
              </SettingRow>
            ))
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
