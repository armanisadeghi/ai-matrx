"use client";

// One news monitor, shown as exactly what its judgment stages receive — the
// news_client_context of aidream services/news/client_context.py — in
// readable sections. Each section links to the one place it is edited: topics,
// search terms and the brief in the monitor editor; the description and facts
// on the brand; competitors on the brand's competitor page.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookText,
  Building2,
  ListChecks,
  Pencil,
  Swords,
  Tags,
} from "lucide-react";
import { Button, EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { formatRelativeTime } from "@ai-matrx/kit/format";

import { AdminPoints } from "@/components/cost/AdminCost";
import { formatAdminUsd } from "@/components/cost/formatAdminCost";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useTrackerInputs, type NewsTrackerInputs } from "./data";

const STATUS_BADGE = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
} as const;

const FACT_KIND: Record<string, string> = {
  spokesperson: "Spokesperson",
  proof: "Proof",
};

function stripTemplateComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function EditLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <Button asChild variant="quiet" icon={<Pencil className="h-4 w-4" />}>
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {title}
          {count !== undefined ? (
            <span className="ml-1.5 font-normal text-muted-foreground">{count}</span>
          ) : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-md border border-border bg-card px-2 py-0.5 text-sm">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Body({ tracker }: { tracker: NewsTrackerInputs }) {
  const editorHref = tracker.brandId
    ? marketingRoutes.brandMonitorSetup(tracker.brandId, { trackerId: tracker.id })
    : null;
  const brandHref = tracker.brandId ? marketingRoutes.brandIdentity(tracker.brandId) : null;
  const competitorsHref = tracker.brandId
    ? marketingRoutes.brandCompetitors(tracker.brandId)
    : null;
  const brief = stripTemplateComments(tracker.briefText);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Brand</dt>
          <dd className="truncate">
            {tracker.brandId ? (
              <Link href={marketingRoutes.brand(tracker.brandId)} className="hover:underline">
                {tracker.brandName}
              </Link>
            ) : (
              <span className="text-destructive">No brand</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Runs 30d</dt>
          <dd>{tracker.runs30d}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">AI cost 30d</dt>
          <dd>
            {formatAdminUsd(tracker.cost30dUsd)} · <AdminPoints usd={tracker.cost30dUsd} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last run</dt>
          <dd>{tracker.lastRunAt ? formatRelativeTime(tracker.lastRunAt) : "Never"}</dd>
        </div>
      </dl>

      <Section
        title="Topics"
        count={tracker.topics.length}
        action={tracker.topics.length ? <EditLink href={editorHref} label="Edit topics" /> : null}
      >
        {tracker.topics.length ? (
          <Chips items={tracker.topics} />
        ) : (
          <EmptyState
            icon={<Tags />}
            title="No topics"
            line="Without topics every story is judged against the brand name alone."
            action={<EditLink href={editorHref} label="Add topics" />}
          />
        )}
      </Section>

      <Section
        title="Brief"
        action={brief && !tracker.briefIsEmpty ? <EditLink href={editorHref} label="Edit brief" /> : null}
      >
        {brief && !tracker.briefIsEmpty ? (
          <div className="whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm">
            {brief}
          </div>
        ) : (
          <EmptyState
            icon={<BookText />}
            title="No brief"
            line="Write who you serve and which stories matter."
            action={<EditLink href={editorHref} label="Write the brief" />}
          />
        )}
      </Section>

      <Section
        title="Competitors"
        count={tracker.competitors.length}
        action={tracker.competitors.length ? <EditLink href={competitorsHref} label="Edit competitors" /> : null}
      >
        {tracker.competitors.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {tracker.competitors.map((name) => (
              <li key={name}>
                {competitorsHref ? (
                  <Link
                    href={competitorsHref}
                    className="inline-block rounded-md border border-border bg-card px-2 py-0.5 text-sm hover:underline"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="rounded-md border border-border px-2 py-0.5 text-sm">{name}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Swords />}
            title="No competitors"
            line="Name rivals so their news is told apart from yours."
            action={<EditLink href={competitorsHref} label="Add competitors" />}
          />
        )}
      </Section>

      <Section
        title="Brand description"
        count={tracker.brandDescription.length || undefined}
        action={tracker.brandDescription ? <EditLink href={brandHref} label="Edit on brand" /> : null}
      >
        {tracker.brandDescription ? (
          <p className="whitespace-pre-wrap text-sm">{tracker.brandDescription}</p>
        ) : (
          <EmptyState
            icon={<Building2 />}
            title="No brand description"
            line="Say what the company does in a few sentences."
            action={<EditLink href={brandHref} label="Add on brand" />}
          />
        )}
      </Section>

      <Section
        title="Business facts"
        count={tracker.facts.length}
        action={tracker.facts.length ? <EditLink href={brandHref} label="Edit on brand" /> : null}
      >
        {tracker.facts.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card text-sm">
            {tracker.facts.map((fact) => (
              <li key={fact.id} className="flex items-baseline gap-3 px-3 py-1.5">
                <span className="w-28 shrink-0 truncate text-muted-foreground">
                  {FACT_KIND[fact.kind] ?? fact.label ?? fact.kind}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {fact.text || "—"}
                  {fact.title ? <span className="text-muted-foreground"> · {fact.title}</span> : null}
                </span>
                {fact.url ? (
                  <a href={fact.url} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:underline">
                    Source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<ListChecks />}
            title="No business facts"
            line="Add spokespeople and proof the news angles can cite."
            action={<EditLink href={editorHref ?? brandHref} label="Add facts" />}
          />
        )}
      </Section>

      {tracker.searchTerms.length || tracker.excludeTerms.length ? (
        <Section
          title="Search terms"
          count={tracker.searchTerms.length}
          action={<EditLink href={editorHref} label="Edit terms" />}
        >
          {tracker.searchTerms.length ? <Chips items={tracker.searchTerms} /> : null}
          {tracker.excludeTerms.length ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Excluded</span>
              <Chips items={tracker.excludeTerms} />
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

export function NewsTrackerInputsView({ trackerId }: { trackerId: string }) {
  const query = useTrackerInputs(trackerId);
  const tracker = query.data ?? null;
  const editorHref = tracker?.brandId
    ? marketingRoutes.brandMonitorSetup(tracker.brandId, { trackerId: tracker.id })
    : null;

  return (
    <>
      <RecordPageHeader
        backHref="/marketing/monitoring"
        parents={[{ label: "News monitors", href: "/marketing/monitoring" }]}
        record={{ name: tracker?.name ?? "News monitor" }}
        status={tracker ? STATUS_BADGE[tracker.status] : undefined}
        actions={
          editorHref
            ? [{ label: "Edit monitor", icon: Pencil, href: editorHref, primary: true }]
            : []
        }
      />
      <div className="h-full min-h-0 overflow-y-auto pt-[var(--shell-header-h)]">
        {query.isLoading ? (
          <RegionSkeleton />
        ) : query.isError ? (
          <EmptyState
            icon={<BookText />}
            title="Could not load this monitor"
            line={query.error instanceof Error ? query.error.message : String(query.error)}
            action={
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : tracker ? (
          <Body tracker={tracker} />
        ) : (
          <EmptyState
            icon={<BookText />}
            title="Monitor not available"
            line="It may be archived, or belong to an organization you do not administer."
            action={
              <Button asChild variant="outline">
                <Link href="/marketing/monitoring">All monitors</Link>
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
