"use client";

// features/admin/usage-drill/UsageExplorer.tsx — THE USAGE PAGE: A MOUNT OF THE ONE EXPLORER
// (lane DRILL-USAGE-PAGE built it; lane DRILL-EXPLORER moved the screen into
// components/official/drill-explorer, so usage, CX usage, KG cost and workflow runs share it).
//
// Today's usage screens — usage by person, the Spend Explorer's cuts, cx-dashboard's model /
// provider / day — are each ONE question of the declared definition `ai_usage`, asked through the
// one read door in the platform lane. What only usage adds: the names of people, organizations and
// agents (`platform.ai_usage_names`), the rollup's own freshness and Recount, the Spend Explorer as
// the place the calls behind a number open, and a link back to the old page.
//
// Built side by side with the old pages (COPY mode): nothing links here but the old page's
// "Try the new usage page", and nothing of theirs changed.

import AppLink from "@/components/navigation/AppLink";
import { bucketWindow, drillWindowRange, parseDimensionRef, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

import { USAGE_SOURCE, usageNameResolvers, useUsageFreshness } from "./useUsageDrill";
import { USAGE_WORDS } from "./usageWords";

/** The first screen: everyone's spend in the last 30 days, by person, costliest first (the definition's own default). */
export const USAGE_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["person"],
  show: ["cost", "requests", "tokens_in", "tokens_out"],
  where: [],
  sort: { key: "cost", direction: "desc" },
  window: "30d",
};

export function UsageExplorer() {
  // THE PLATFORM LANE ASKS IN THE PLATFORM'S OWN ORGANIZATION. The door needs an organization only
  // to know whose calendar cuts the periods; the admin seat never acts as itself (no active-org
  // dependency in admin), and the platform organization's calendar is UTC — the rollup's own hours.
  const organizationId = SYSTEM_ORGANIZATION_ID;
  const freshness = useUsageFreshness(organizationId);
  return (
    <DrillExplorer
      source={USAGE_SOURCE}
      lane="platform"
      organizationId={organizationId}
      title="AI usage"
      rootLabel="All usage"
      firstQuestion={USAGE_FIRST_QUESTION}
      names={usageNameResolvers(organizationId)}
      headline={{ measure: "cost", also: ["calls", "requests"] }}
      freshness={freshness}
      recordsLink={{ href: spendHref, lead: spendLead, label: "Spend Explorer" }}
      rowNoun="request"
      countMeasure="requests"
      windowAlign="hour"
      words={USAGE_WORDS}
      dataAttributes={{ "data-usage-explorer": "" }}
      headerExtras={
        <AppLink href="/administration/users/usage" className="underline-offset-2 hover:underline">
          Old usage page
        </AppLink>
      }
    />
  );
}

// ── THE HAND-OFF TO THE SPEND EXPLORER (VERIFIER-32 F2) ─────────────────────────────────────────
// The rollup holds no single calls, so the calls behind a number open in the Spend Explorer, which
// lists them. EVERYTHING the Spend Explorer can narrow by is carried: each crumb it knows
// (`f.<dimension>`, person = its `user`), a period crumb as its own custom window (a day as its
// `f.day`), and the window — its three presets, or a custom window of whole days, never quietly
// swapped for another. What it cannot narrow by (provider; more than its 92 days) is SAID in the
// sentence before the link. Once `ai_usage` declares records (program DRILL-FINISH decision 24), the
// explorer reads them through `platform.drill_rows` instead and this hand-off goes.

const SPEND_DIMENSION: Record<string, string> = {
  person: "user", organization: "organization", agent: "agent", app: "app", feature: "feature",
  origin: "origin", trigger: "trigger", source: "source", model: "model",
};
const SPEND_MAX_DAYS = 92;
const SPEND_PRESETS: Record<string, string> = { "24h": "last24h", "7d": "last7d", "30d": "last30d" };

type Handoff = { params: URLSearchParams; dropped: string[] };

function day(iso: string): string {
  return iso.slice(0, 10);
}

/** The question in the Spend Explorer's address grammar, and what it could not carry. */
export function spendHandoff(question: MatrxDrillQuestion, now: Date = new Date()): Handoff {
  const params = new URLSearchParams();
  const dropped: string[] = [];
  let from: string | null = null;
  let to: string | null = null; // exclusive
  for (const w of question.where) {
    const { key, grain } = parseDimensionRef(w.dim);
    if (grain && w.value) {
      const span = bucketWindow(w.value, grain);
      if (grain === "day") params.set("f.day", day(span.from));
      from = day(span.from);
      to = day(span.to);
      continue;
    }
    const spendKey = SPEND_DIMENSION[key];
    if (spendKey) params.set(`f.${spendKey}`, w.value ?? "(none)");
    else dropped.push(key === "provider" ? "provider" : key);
  }
  if (!from) {
    const preset = question.window ? SPEND_PRESETS[question.window] : undefined;
    if (preset) {
      params.set("win", preset);
      return { params, dropped };
    }
    const range = drillWindowRange(question.window ?? "30d", now);
    if (range) {
      from = day(range.from);
      to = day(new Date(new Date(range.to).getTime() + 86_400_000).toISOString());
    }
  }
  if (from && to) {
    // Its custom window is two INCLUSIVE local days, at most 92 of them.
    let fromDay = new Date(`${from}T00:00:00Z`);
    const lastDay = new Date(new Date(`${to}T00:00:00Z`).getTime() - 86_400_000);
    const days = Math.round((lastDay.getTime() - fromDay.getTime()) / 86_400_000) + 1;
    if (days > SPEND_MAX_DAYS) {
      fromDay = new Date(lastDay.getTime() - (SPEND_MAX_DAYS - 1) * 86_400_000);
      dropped.push(`the days before ${fromDay.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} (it shows at most ${SPEND_MAX_DAYS} days)`);
    }
    params.set("win", "custom");
    params.set("from", day(fromDay.toISOString()));
    params.set("to", day(lastDay.toISOString()));
  }
  return { params, dropped };
}

export function spendHref(question: MatrxDrillQuestion): string {
  return `/administration/billing/spend?${spendHandoff(question).params.toString()}`;
}

/** The sentence before the link: what the Spend Explorer will NOT narrow by, said out loud. */
export function spendLead(question: MatrxDrillQuestion): string {
  const { dropped } = spendHandoff(question);
  if (dropped.length === 0) return "The calls behind a number open in the";
  return `The calls behind a number open in the Spend Explorer, which cannot narrow by ${dropped.join(" or ")}, so it lists more than this slice — open the`;
}
