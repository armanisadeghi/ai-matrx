"use client";

/**
 * MarketingRefs — the doors for the ids that marketing rows carry.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it — and
 * an id it CANNOT resolve is its own loud state, never a fake door and never a
 * bare truncated uuid.
 *
 * Everything here composes `EntityRef` (route + new tab + peek, all from the
 * registries) — none of it hand-rolls a link. Three references, because these
 * three appear on nearly every marketing record:
 *
 *  - `<AnalysisSubjectRef>`  subject_type + subject_id → the right token.
 *    `web.finding` / `web.analysis_result` store the subject polymorphically
 *    (`site` | `page` | `snapshot`), and all three tokens have routes, so the
 *    subject was always openable and was printed as text.
 *  - `<CrawlSessionRef>`     a `web.crawl_session` id → the site's crawl route.
 *    `web_crawl_session` has no flat resolver route (a crawl is only meaningful
 *    inside its site), so the door is built from the site path the caller is
 *    already standing in — that is a route override, not a second registry.
 *  - `<AnalysisRunRef>`      `analysis_result.run_id` has NO foreign key. It is
 *    a crawl session for analyzer passes that ran inside a crawl, and an opaque
 *    provider id otherwise. `useCrawlSessionRef` asks (one indexed read) and we
 *    render the crawl door when the answer is yes, and say plainly that the run
 *    is external when it is no.
 */

import { useQuery } from "@tanstack/react-query";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  getAnalysisProvider,
  getCrawlSessionRef,
} from "@/features/marketing/data/service";
import { cn } from "@/lib/utils";

const SUBJECT_TOKENS: Record<string, string> = {
  site: "web_site",
  page: "web_page",
  snapshot: "web_snapshot",
};

/** An id we could not turn into a door — said out loud, with the id kept. */
export function UnresolvedRef({
  id,
  reason,
  className,
}: {
  id: string;
  reason: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-baseline gap-1.5", className)}
      title={id}
    >
      <span className="break-all font-mono text-[11px] text-foreground">
        {id}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {reason}
      </span>
    </span>
  );
}

export function AnalysisSubjectRef({
  subjectType,
  subjectId,
  name,
  className,
}: {
  subjectType: string;
  subjectId: string;
  /** The subject's human name when the caller already has it. */
  name?: string | null;
  className?: string;
}) {
  const token = SUBJECT_TOKENS[subjectType];
  if (!token) {
    return (
      <UnresolvedRef
        id={subjectId}
        reason={`${subjectType} — no record type registered`}
        className={className}
      />
    );
  }
  return (
    <EntityRef
      token={token}
      id={subjectId}
      name={name ?? undefined}
      wrap
      className={className}
    />
  );
}

/** Ask whether an id is one of this site's crawl sessions. */
export function useCrawlSessionRef(
  siteId: string,
  candidateId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["marketing", "crawl-session-ref", siteId, candidateId],
    queryFn: ({ signal }) =>
      getCrawlSessionRef(siteId, candidateId as string, signal),
    enabled: Boolean(siteId && candidateId),
    staleTime: 5 * 60_000,
  });
}

/**
 * The analyzer behind a result, by NAME. `web.provider` is a real record, so
 * printing its uuid told the user nothing about which check ran.
 */
export function AnalysisProviderRef({
  providerId,
  version,
  className,
}: {
  providerId: string;
  version?: string | null;
  className?: string;
}) {
  const provider = useQuery({
    queryKey: ["marketing", "analysis-provider", providerId],
    queryFn: ({ signal }) => getAnalysisProvider(providerId, signal),
    enabled: Boolean(providerId),
    staleTime: 30 * 60_000,
  });
  const suffix = version ? ` · v${version}` : "";
  if (provider.data) {
    return (
      <span className={cn("min-w-0", className)} title={providerId}>
        {provider.data.label}
        <span className="text-muted-foreground">
          {" "}
          ({provider.data.key}){suffix}
        </span>
      </span>
    );
  }
  if (provider.isLoading) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        Resolving analyzer…
      </span>
    );
  }
  return (
    <UnresolvedRef
      id={providerId}
      reason={`analyzer not in this catalogue${suffix}`}
      className={className}
    />
  );
}

export function CrawlSessionRef({
  sitePath,
  sessionId,
  label,
  className,
}: {
  sitePath: string;
  sessionId: string;
  label?: string | null;
  className?: string;
}) {
  return (
    <EntityRef
      token="web_crawl_session"
      id={sessionId}
      name={label ?? `Crawl ${sessionId.slice(0, 8)}`}
      href={`${sitePath}/crawls/${sessionId}`}
      wrap
      className={className}
    />
  );
}

export function AnalysisRunRef({
  siteId,
  sitePath,
  runId,
  className,
}: {
  siteId: string;
  sitePath: string;
  runId: string;
  className?: string;
}) {
  const crawl = useCrawlSessionRef(siteId, runId);
  if (crawl.isLoading) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        Resolving run {runId.slice(0, 8)}…
      </span>
    );
  }
  if (crawl.data) {
    return (
      <CrawlSessionRef
        sitePath={sitePath}
        sessionId={runId}
        label={`Crawl ${crawl.data.trigger} · ${crawl.data.status}`}
        className={className}
      />
    );
  }
  return (
    <UnresolvedRef
      id={runId}
      reason="analysis run outside this site's crawls"
      className={className}
    />
  );
}
