"use client";

// features/mandates/feature-intelligence/IntelligenceIndex.tsx
//
// /intelligence — the directory of every part of the app that uses AI, in the
// registry's shape: a section per Domain, a card per registry Feature (its
// icon and name, the jobs it runs, how many places they run, and — once the
// member list answers — how many agents and workflows run them for you and how
// many are not running), and one honest "not yet assigned to a feature" card
// per Domain. Search finds a card by its name, its Domain, or anything inside
// it — a job's name or what it does, the screen it runs on, the agent or
// workflow running it. Each card opens that target's intelligence page.
// `focusDomain` (from `?domain=`, where old page ids land) scrolls to a Domain.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  MapPin,
  Workflow,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { SearchInput } from "@/components/official/SearchInput";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAdmin,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  callMandateMemberList,
  memberRowFromWire,
  type MandateMemberPageAnswer,
} from "../member-list/rpc";
import { featureIntelligenceHref } from "./hrefs";
import { featureIcon } from "./feature-icons";
import { lanesFor } from "./service";
import {
  buildDirectory,
  buildDomains,
  matchFeature,
  matchStrength,
  summarize,
  type DirectoryDefinition,
  type DirectoryDomain,
  type DirectoryFeature,
  type DirectoryHolder,
  type MatchReason,
} from "./index-model";

/** Kept for the index tests: one row per feature with its counts. */
export function buildIndexRows(mandateKeys: readonly string[]) {
  return buildDirectory(
    mandateKeys.map((mandate_key) => ({ mandate_key })),
  ).map((row) => ({
    feature: row.feature,
    label: row.label,
    domain: row.domain,
    jobs: row.jobs.length,
    places: row.places.length,
    unassigned: row.unassigned,
    fixture: row.fixture,
  }));
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function jobsLine(feature: DirectoryFeature): string {
  if (feature.jobs.length === 0) return "No jobs you can see yet";
  const names = feature.jobs.slice(0, 4).map((job) => job.name);
  const more = feature.jobs.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}

function reasonText(reason: MatchReason): string | null {
  if (reason.kind === "name" && reason.partial) return null;
  switch (reason.kind) {
    case "job":
      return `Job: ${reason.text}`;
    case "place":
      return `Runs on: ${reason.text}`;
    case "holder":
      return `Run by: ${reason.text}`;
    default:
      return null;
  }
}

function FeatureCard({
  feature,
  reason,
}: {
  feature: DirectoryFeature;
  reason: MatchReason;
}) {
  const Icon = featureIcon(feature.feature, feature.domain);
  const summary = summarize(feature);
  const why = reasonText(reason);
  return (
    <li className="min-w-0">
      <Link
        href={featureIntelligenceHref(feature.feature)}
        className="group flex h-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-foreground">
            {feature.label}
          </span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">
            {plural(feature.jobs.length, "job")}
          </span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {jobsLine(feature)}
        </p>
        {why ? (
          <p className="truncate text-[12px] font-medium text-primary">{why}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[12px] text-muted-foreground">
          {summary.agents > 0 ? (
            <span className="inline-flex items-center gap-1">
              <AGENT_ICON className="h-3.5 w-3.5" aria-hidden />
              {plural(summary.agents, "agent")}
            </span>
          ) : null}
          {summary.workflows > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Workflow className="h-3.5 w-3.5" aria-hidden />
              {plural(summary.workflows, "workflow")}
            </span>
          ) : null}
          {feature.places.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {plural(feature.places.length, "place")}
            </span>
          ) : null}
          {summary.known ? (
            summary.notRunning > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden />
                {summary.notRunning} not running
              </span>
            ) : feature.jobs.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                All running
              </span>
            ) : null
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function DomainSection({
  domain,
  items,
  focused,
}: {
  domain: DirectoryDomain;
  items: { feature: DirectoryFeature; reason: MatchReason }[];
  focused: boolean;
}) {
  if (items.length === 0) return null;
  const id = `intelligence-domain-${domain.domain ?? "none"}`;
  const jobs = items.reduce((sum, item) => sum + item.feature.jobs.length, 0);
  return (
    <section
      className="mt-6 scroll-mt-20 first:mt-0"
      aria-labelledby={`${id}-title`}
      id={id}
    >
      <h2
        id={`${id}-title`}
        className={cn(
          "mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-foreground",
          focused && "text-primary",
        )}
      >
        <span>{domain.label}</span>
        <span className="text-[12px] font-normal tabular-nums text-muted-foreground">
          {plural(items.length, "feature")}, {plural(jobs, "job")}
        </span>
      </h2>
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <FeatureCard
            key={`${item.feature.feature}:${item.feature.fixture ? "fixture" : "jobs"}`}
            feature={item.feature}
            reason={item.reason}
          />
        ))}
      </ul>
    </section>
  );
}

/** Every job's holder from this seat, in one read per lane the jobs live in. */
async function fetchHolders(
  defs: readonly (DirectoryDefinition & {
    organization_id: string | null;
    created_by: string | null;
  })[],
  organizationId: string | null,
  userId: string | null,
): Promise<DirectoryHolder[]> {
  const systemOrgId = await resolveSystemOrgId();
  const lanes = lanesFor(defs, systemOrgId, userId, "person");
  const answers = await Promise.all(
    lanes.map((scope) =>
      callMandateMemberList<MandateMemberPageAnswer>({
        p_mode: "page",
        p_level: "person",
        p_scope: scope,
        p_resolve_org_id: organizationId ?? undefined,
        p_sort: "name",
        p_dir: "asc",
        p_limit: 5000,
        p_offset: 0,
      }),
    ),
  );
  return answers.flatMap((answer) =>
    answer.rows.map(memberRowFromWire).map((row) => ({
      mandateKey: row.mandateKey,
      holderName: row.holderName,
      holderType: row.holderType,
      status: row.status,
    })),
  );
}

export function IntelligenceIndex({
  focusDomain = null,
}: { focusDomain?: string | null } = {}) {
  const [defs, setDefs] = useState<
    | (DirectoryDefinition & {
        organization_id: string | null;
        created_by: string | null;
      })[]
    | null
  >(null);
  const [holders, setHolders] = useState<DirectoryHolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const isAdmin = useAppSelector(selectIsAdmin);
  const userId = useAppSelector(selectUserId);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const { organizationState } = useOrganizationRequired();

  useEffect(() => {
    let cancelled = false;
    readAllRows(
      ({ from, to }) =>
        mandateDefinitions(createClient())
          .select(
            "mandate_key, label, description, goal, organization_id, created_by",
            {
              count: "exact",
            },
          )
          .is("deleted_at", null)
          .order("mandate_key", { ascending: true })
          .range(from, to),
      { label: "mandate definitions for the intelligence index" },
    )
      .then((rows) => {
        if (!cancelled) setDefs(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // What runs each job, from this seat — read after the cards are up, and only
  // once the organization is settled (a read with no org is thrown away). A
  // failed read leaves the cards without their agent/workflow line; search
  // still finds jobs, places and names.
  useEffect(() => {
    if (!defs || organizationState === "resolving") return;
    let cancelled = false;
    fetchHolders(defs, activeOrgId, userId)
      .then((rows) => {
        if (!cancelled) setHolders(rows);
      })
      .catch((cause: unknown) => {
        console.warn(
          "[intelligence] holders for the directory could not be read",
          cause,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [defs, activeOrgId, userId, organizationState]);

  const domains = defs ? buildDomains(defs, holders) : null;
  const directory = domains
    ? domains.flatMap((domain) => domain.features)
    : null;
  const searching = query.trim().length > 0;

  const sections = (domains ?? []).map((domain) => {
    const items: { feature: DirectoryFeature; reason: MatchReason }[] = [];
    for (const feature of domain.features) {
      if (feature.fixture && !isAdmin) continue;
      const reason = matchFeature(feature, query);
      if (reason) items.push({ feature, reason });
    }
    // While searching, the strongest matches lead (the sort is stable, so the
    // registry's own order holds inside each strength).
    if (searching)
      items.sort((a, b) => matchStrength(b.reason) - matchStrength(a.reason));
    return { domain, items };
  });
  const matchedCount = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const visible = (directory ?? []).filter((row) => !row.fixture);
  const totalJobs = visible.reduce((sum, row) => sum + row.jobs.length, 0);
  const featureCount = visible.filter((row) => !row.unassigned).length;
  const domainCount = new Set(visible.map((row) => row.domain).filter(Boolean))
    .size;

  // An old page id lands here with `?domain=` — bring that Domain into view once.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!focusDomain || !domains || scrolled.current) return;
    scrolled.current = true;
    document
      .getElementById(`intelligence-domain-${focusDomain}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusDomain, domains]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
      <div className="sticky top-0 z-10 -mx-4 max-w-none bg-background/95 px-4 pb-3 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search domains, features, jobs, screens, agents, workflows"
            aria-label="Search intelligence"
            className="w-full sm:max-w-md"
            inputClassName="text-base sm:text-sm"
          />
          {directory ? (
            <p className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
              {searching
                ? `${matchedCount} match`
                : `${plural(domainCount, "domain")}, ${plural(featureCount, "feature")}, ${plural(totalJobs, "job")}`}
            </p>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          The features could not be read: {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : directory === null ? (
        <div className="flex min-h-[30dvh] items-center justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-label="Loading features"
          />
        </div>
      ) : matchedCount === 0 ? (
        <div className="flex min-h-[20dvh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13.5px] text-muted-foreground">
            Nothing matches &ldquo;{query.trim()}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        sections.map((section) => (
          <DomainSection
            key={section.domain.domain ?? "none"}
            domain={section.domain}
            items={section.items}
            focused={!searching && section.domain.domain === focusDomain}
          />
        ))
      )}
    </div>
  );
}
