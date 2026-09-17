"use client";

/**
 * THE approvals console — every pending AI proposal across every site the
 * reader can see, one place (register KI-045).
 *
 * It mounts THE ONE queue (`ApprovalQueue`) per site — never a second
 * approval mechanic. The site list is the reader's own RLS-scoped site read
 * (the run console's), because a placement proposal or an inherited-offering
 * drift is not a row addressed to a person the way an assist is: the only
 * honest way to know whether a site has one is to ask that site.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  InlineQueryError,
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";
import { listConsoleSites } from "@/features/marketing/seo/run-console/data";
import { ApprovalQueue, type ApprovalQueueSummary } from "@/features/approvals/ApprovalQueue";
import { SEO_APPROVAL_KIND_IDS } from "@/features/approvals/registry";

export function ApprovalsConsole() {
  const sites = useQuery({
    queryKey: ["marketing", "approvals", "sites"],
    queryFn: () => listConsoleSites({ tier: "system" }),
    staleTime: 5 * 60_000,
  });
  const [summaries, setSummaries] = useState<Record<string, ApprovalQueueSummary>>({});

  if (sites.isLoading) {
    return <LoadingSurface label="Finding your sites…" />;
  }
  if (sites.error) {
    return (
      <InlineQueryError
        what="the sites you can approve for"
        error={sites.error}
        onRetry={() => void sites.refetch()}
      />
    );
  }

  const rows = sites.data ?? [];
  const reported = rows.filter((site) => summaries[site.id]);
  const stillReading = rows.filter(
    (site) => !summaries[site.id] || summaries[site.id]?.loading,
  ).length;
  const waiting = reported.reduce(
    (sum, site) => sum + (summaries[site.id]?.count ?? 0),
    0,
  );
  const errors = reported.reduce(
    (sum, site) => sum + (summaries[site.id]?.errors ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      {stillReading > 0 ? (
        <LoadingSurface
          label={`Reading ${stillReading} of ${rows.length} sites' approval queues…`}
        />
      ) : waiting === 0 && errors === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <p className="text-sm font-medium">Nothing is waiting on you</p>
          <p className="max-w-md text-xs text-muted-foreground">
            When an agent proposes a change to how any of your {rows.length}{" "}
            sites reads its keywords — a matcher, a worth, a stamp, a
            guidelines edit, an offering placement it was unsure of, or an
            inherited offering that moved — it appears here, and nothing takes
            effect until you rule on it.
          </p>
        </div>
      ) : null}

      {/* Said once, not once per site: the platform kinds are addressed to a
          person, so they wait in that person's own queue. */}
      <p className="text-xs text-muted-foreground">
        This page is the keyword proposals for every site you can see. An email
        an agent drafted, or a change to one of your spreadsheets, waits with
        you rather than with a site —{" "}
        <AppLink
          href="/approvals"
          className="text-primary underline-offset-2 hover:underline"
        >
          open what is waiting on you
        </AppLink>
        .
      </p>

      {rows.map((site) => (
        <ApprovalQueue
          key={site.id}
          scope={{
            key: site.id,
            siteId: site.id,
            brandId: site.brand_id,
            organizationId: site.organization_id,
            siteLabel: site.name || site.domain,
          }}
          // Site-scoped kinds only. The platform kinds (an email to send, a
          // spreadsheet change) are addressed to a PERSON, and this console
          // mounts one queue per site — unfiltered, every site would repeat the
          // same rows and multiply the waiting count. The line below says where
          // they are, once.
          kinds={SEO_APPROVAL_KIND_IDS}
          defaultExpanded
          title={
            <EntityRef
              token="web_site"
              id={site.id}
              name={site.name || site.domain || site.id}
            />
          }
          onSummary={(siteId, summary) =>
            setSummaries((previous) => ({ ...previous, [siteId]: summary }))
          }
        />
      ))}
    </div>
  );
}
