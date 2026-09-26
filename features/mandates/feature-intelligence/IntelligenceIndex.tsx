"use client";

// features/mandates/feature-intelligence/IntelligenceIndex.tsx
//
// /intelligence — the directory of every part of the app that uses AI. One
// card per feature: its icon and name, the jobs it runs, how many places they
// run, and (once the member list answers) how many agents and workflows run
// them for you and how many are not running. Search finds a feature by its
// name or by anything inside it — a job's name or what it does, the screen it
// runs on, the agent or workflow running it. Each card opens that feature's
// intelligence page. Features with jobs but no declared places still appear.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Loader2, MapPin, Workflow } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { SearchInput } from "@/components/official/SearchInput";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
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
  matchFeature,
  matchStrength,
  summarize,
  type DirectoryDefinition,
  type DirectoryFeature,
  type DirectoryHolder,
  type MatchReason,
} from "./index-model";

/** Kept for the index tests: one row per feature with its counts. */
export function buildIndexRows(mandateKeys: readonly string[]) {
  return buildDirectory(mandateKeys.map((mandate_key) => ({ mandate_key }))).map((row) => ({
    feature: row.feature,
    label: row.label,
    jobs: row.jobs.length,
    places: row.places.length,
    declared: row.declared,
    fixture: row.fixture,
  }));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  const Icon = featureIcon(feature.feature);
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

function Section({
  id,
  title,
  items,
}: {
  id: string;
  title?: string;
  items: { feature: DirectoryFeature; reason: MatchReason }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-5 first:mt-0" aria-labelledby={title ? id : undefined}>
      {title ? (
        <h2 id={id} className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      ) : null}
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <FeatureCard key={item.feature.feature} feature={item.feature} reason={item.reason} />
        ))}
      </ul>
    </section>
  );
}

/** Every job's holder from this seat, in one read per lane the jobs live in. */
async function fetchHolders(
  defs: readonly (DirectoryDefinition & { organization_id: string | null; created_by: string | null })[],
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

export function IntelligenceIndex() {
  const [defs, setDefs] = useState<
    (DirectoryDefinition & { organization_id: string | null; created_by: string | null })[] | null
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
          .select("mandate_key, label, description, goal, organization_id, created_by", {
            count: "exact",
          })
          .is("deleted_at", null)
          .order("mandate_key", { ascending: true })
          .range(from, to),
      { label: "mandate definitions for the intelligence index" },
    )
      .then((rows) => {
        if (!cancelled) setDefs(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
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
        console.warn("[intelligence] holders for the directory could not be read", cause);
      });
    return () => {
      cancelled = true;
    };
  }, [defs, activeOrgId, userId, organizationState]);

  const directory = defs ? buildDirectory(defs, holders) : null;

  const matched: { feature: DirectoryFeature; reason: MatchReason }[] = [];
  for (const feature of directory ?? []) {
    if (feature.fixture && !isAdmin) continue;
    const reason = matchFeature(feature, query);
    if (reason) matched.push({ feature, reason });
  }
  // While searching, the strongest matches lead (the sort is stable, so the
  // directory's own order holds inside each strength).
  if (query.trim()) matched.sort((a, b) => matchStrength(b.reason) - matchStrength(a.reason));

  const searching = query.trim().length > 0;
  const declared = matched.filter((item) => item.feature.declared);
  const others = matched.filter((item) => !item.feature.declared && !item.feature.fixture);
  const fixtures = matched.filter((item) => item.feature.fixture);
  const totalJobs = (directory ?? [])
    .filter((row) => !row.fixture)
    .reduce((sum, row) => sum + row.jobs.length, 0);
  const featureCount = (directory ?? []).filter((row) => !row.fixture).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search features, jobs, screens, agents, workflows"
            aria-label="Search intelligence"
            className="w-full sm:max-w-md"
            inputClassName="text-base sm:text-sm"
          />
          {directory ? (
            <p className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
              {searching
                ? `${plural(matched.length, "feature")} match`
                : `${plural(featureCount, "feature")}, ${plural(totalJobs, "job")}`}
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
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading features" />
        </div>
      ) : matched.length === 0 ? (
        <div className="flex min-h-[20dvh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13.5px] text-muted-foreground">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          <Section id="intelligence-main" items={declared} />
          <Section
            id="intelligence-more"
            title={declared.length > 0 ? "More features" : undefined}
            items={others}
          />
          <Section id="intelligence-fixtures" title="Test fixtures, admins only" items={fixtures} />
        </>
      )}
    </div>
  );
}
