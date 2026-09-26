// features/mandates/feature-intelligence/index-model.ts
//
// THE /intelligence DIRECTORY, as data, in the registry's own shape: one
// section per Domain, one card per registry Feature that holds jobs, and one
// honest "not yet assigned to a feature" card per Domain for jobs no Feature
// holds yet (`placement.ts`). Each card carries its jobs, the places they run
// and (once the member list answers) what runs each one from the viewer's
// seat. Search reads all of it, Domain name included. Pure: the component and
// the tests share it.

import type { MandateStatus } from "@/features/mandates/status/mandate-status";
import { declaredPlacesForTarget } from "./registry";
import {
  NOT_ASSIGNED_TO_DOMAIN,
  NOT_ASSIGNED_TO_FEATURE,
  DOMAINS_HOLDING_OWN_JOBS,
  NO_DOMAIN_TARGET,
  placementForKey,
  targetForKey,
  targetDomain,
  targetLabel,
} from "./placement";
import { REGISTRY_DOMAINS, registryDomain } from "./taxonomy";
import { shortMandateName } from "./service";

/** One job as the directory needs it. */
export interface DirectoryJob {
  key: string;
  /** Name without the feature or domain label the card already shows. */
  name: string;
  description: string | null;
  goal: string | null;
  /** From the member list, once it answers: who runs it from this seat. */
  holderName?: string;
  holderType?: "agent" | "workflow" | null;
  status?: MandateStatus;
}

export interface DirectoryPlace {
  label: string;
  trigger: string;
}

export interface DirectoryFeature {
  /** The page id (`placement.ts` target): a registry Feature id, `<domain>/unassigned`, or `unassigned`. */
  feature: string;
  /** The card's name: the registry Feature's name, or the honest gap. */
  label: string;
  /** Registry Domain id, or null for jobs with no Domain yet. */
  domain: string | null;
  jobs: DirectoryJob[];
  places: DirectoryPlace[];
  /** Jobs no registry Feature holds yet. */
  unassigned: boolean;
  /** A test/parity fixture group — admins only, labeled as such. */
  fixture: boolean;
}

export interface DirectoryDomain {
  /** Section id: a registry Domain id, or `chat` / `agent-apps` / `unassigned`. */
  domain: string | null;
  label: string;
  features: DirectoryFeature[];
}

/** The definition columns the directory reads. */
export interface DirectoryDefinition {
  mandate_key: string;
  label?: string | null;
  description?: string | null;
  goal?: string | null;
}

/** The member-list facts the directory adds to a job. */
export interface DirectoryHolder {
  mandateKey: string;
  holderName: string;
  holderType: string | null;
  status: MandateStatus;
}

function humanizeKeyTail(key: string): string {
  const tail = key
    .slice(key.indexOf(".") + 1)
    .replace(/[._-]+/g, " ")
    .trim();
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : key;
}

const FIXTURES = "fixtures";

/** Directory section ids that are not registry Domains (Arman, 2026-09-26). */
export const AGENT_APPS_SECTION = "agent-apps";
export const UNASSIGNED_SECTION = "unassigned";

const SECTION_LABELS: Readonly<Record<string, string>> = {
  [AGENT_APPS_SECTION]: "Agent Apps",
  [UNASSIGNED_SECTION]: "Not yet assigned",
};

/**
 * Registry Features shown outside their registry Domain's section. Agents
 * holds only agent and system-prompt authoring; the rest go where the feature
 * they serve lives (Arman, 2026-09-26).
 */
const SECTION_OF_FEATURE: Readonly<Record<string, string>> = {
  "agent-apps": AGENT_APPS_SECTION,
  "agent-iteration": "agents", // improving an agent is authoring it
};

function cardLabel(target: string): string {
  if (target === FIXTURES) return "Test fixtures";
  if (target === NO_DOMAIN_TARGET) return NOT_ASSIGNED_TO_DOMAIN;
  if (target.endsWith("/unassigned")) return NOT_ASSIGNED_TO_FEATURE;
  return targetLabel(target);
}

/** Every card, flat — in directory order (Domain by name, then Feature by name, gaps last). */
export function buildDirectory(
  defs: readonly DirectoryDefinition[],
  holders: readonly DirectoryHolder[] = [],
): DirectoryFeature[] {
  return buildDomains(defs, holders).flatMap((domain) => domain.features);
}

export function buildDomains(
  defs: readonly DirectoryDefinition[],
  holders: readonly DirectoryHolder[] = [],
): DirectoryDomain[] {
  const byKey = new Map(holders.map((row) => [row.mandateKey, row]));
  const jobsByTarget = new Map<string, DirectoryJob[]>();
  for (const def of defs) {
    const target = placementForKey(def.mandate_key).fixture
      ? FIXTURES
      : targetForKey(def.mandate_key);
    const domainName = registryDomain(targetDomain(target) ?? "")?.name ?? "";
    const holder = byKey.get(def.mandate_key);
    const job: DirectoryJob = {
      key: def.mandate_key,
      name: def.label
        ? shortMandateName(
            shortMandateName(def.label, cardLabel(target)),
            domainName,
          )
        : humanizeKeyTail(def.mandate_key),
      description: def.description ?? null,
      goal: def.goal ?? null,
      ...(holder
        ? {
            holderName: holder.holderName,
            holderType:
              holder.holderType === "agent" || holder.holderType === "workflow"
                ? holder.holderType
                : null,
            status: holder.status,
          }
        : {}),
    };
    const list = jobsByTarget.get(target) ?? [];
    list.push(job);
    jobsByTarget.set(target, list);
  }
  for (const list of jobsByTarget.values())
    list.sort((a, b) => a.name.localeCompare(b.name));

  const card = (target: string, domain: string | null): DirectoryFeature => ({
    feature: target === FIXTURES ? NO_DOMAIN_TARGET : target,
    label: cardLabel(target),
    domain,
    jobs: jobsByTarget.get(target) ?? [],
    places:
      target === FIXTURES || target === NO_DOMAIN_TARGET
        ? []
        : declaredPlacesForTarget(target).map((place) => ({
            label: place.label,
            trigger: place.trigger,
          })),
    unassigned: target === NO_DOMAIN_TARGET || target.endsWith("/unassigned"),
    fixture: target === FIXTURES,
  });

  // Sections follow the registry Domains, with Arman's rulings (2026-09-26)
  // on top: a job sits with the feature it serves, never under Agents because
  // an agent fills it. Agents shows only agent and system-prompt authoring;
  // Chat is its own section; Agent Apps and every "not yet assigned" group
  // sit at the bottom, each in its own section.
  const bySection = new Map<string, DirectoryFeature[]>();
  const push = (section: string, row: DirectoryFeature) => {
    const list = bySection.get(section) ?? [];
    list.push(row);
    bySection.set(section, list);
  };
  const gaps: DirectoryFeature[] = [];
  for (const domain of REGISTRY_DOMAINS) {
    for (const feature of domain.features) {
      const row = card(feature.id, domain.id);
      // A registry Feature is a card when it holds jobs or places — an empty
      // node is not intelligence.
      if (row.jobs.length === 0 && row.places.length === 0) continue;
      push(SECTION_OF_FEATURE[feature.id] ?? domain.id, row);
    }
    // A Domain whose own row holds jobs (Chat) shows them as its own card.
    if (DOMAINS_HOLDING_OWN_JOBS.has(domain.id)) {
      const own = card(domain.id, domain.id);
      if (own.jobs.length > 0) push(domain.id, own);
    }
    const gap = card(`${domain.id}/unassigned`, domain.id);
    if (gap.jobs.length > 0) gaps.push({ ...gap, label: domain.name });
  }
  const sectionLabel = (id: string) =>
    SECTION_LABELS[id] ?? registryDomain(id)?.name ?? id;
  const byName = (a: DirectoryFeature, b: DirectoryFeature) =>
    a.label.localeCompare(b.label);
  const out: DirectoryDomain[] = [...bySection.entries()]
    .filter(([id]) => id !== AGENT_APPS_SECTION)
    .map(([id, features]) => ({
      domain: id,
      label: sectionLabel(id),
      features: features.sort(byName),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const apps = bySection.get(AGENT_APPS_SECTION);
  if (apps)
    out.push({
      domain: AGENT_APPS_SECTION,
      label: sectionLabel(AGENT_APPS_SECTION),
      features: apps,
    });
  const orphans = [card(NO_DOMAIN_TARGET, null), card(FIXTURES, null)].filter(
    (row) => row.jobs.length > 0,
  );
  const bottom = [...gaps.sort(byName), ...orphans];
  if (bottom.length > 0) {
    out.push({
      domain: UNASSIGNED_SECTION,
      label: sectionLabel(UNASSIGNED_SECTION),
      features: bottom,
    });
  }
  return out;
}

/** How a card's jobs are filled, once the member list has answered. */
export interface DirectorySummary {
  agents: number;
  workflows: number;
  /** Jobs nothing runs yet (draft) or that are turned off. */
  notRunning: number;
  /** False until the member list answered for at least one job. */
  known: boolean;
}

export function summarize(feature: DirectoryFeature): DirectorySummary {
  let agents = 0;
  let workflows = 0;
  let notRunning = 0;
  let known = false;
  for (const job of feature.jobs) {
    if (!job.status) continue;
    known = true;
    if (job.status === "draft" || job.status === "disabled") notRunning++;
    else if (job.holderType === "workflow") workflows++;
    else if (job.holderType === "agent") agents++;
  }
  return { agents, workflows, notRunning, known };
}

/** Why a card matched a search that its name alone does not explain. */
export type MatchReason =
  | { kind: "name"; partial?: boolean }
  | { kind: "job"; text: string; partial?: boolean }
  | { kind: "place"; text: string }
  | { kind: "holder"; text: string };

function tokensOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function hasAll(haystack: string, tokens: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return tokens.every((token) => lower.includes(token));
}

function jobText(job: DirectoryJob): string {
  return [job.name, job.description, job.goal].filter(Boolean).join(" ");
}

/**
 * Does the feature match every word of the query somewhere — its name, a job
 * (name, what it does, its goal), a place (screen, control), or the agent or
 * workflow running a job? Returns why, or null.
 */
export function matchFeature(
  feature: DirectoryFeature,
  query: string,
): MatchReason | null {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return { kind: "name" };
  const name = `${feature.label} ${registryDomain(feature.domain ?? "")?.name ?? ""}`;
  const everything = [
    name,
    ...feature.jobs.map((job) => `${jobText(job)} ${job.holderName ?? ""}`),
    ...feature.places.map((place) => `${place.label} ${place.trigger}`),
  ].join(" ");
  if (!hasAll(everything, tokens)) return null;
  if (hasAll(name, tokens)) return { kind: "name" };
  const job = feature.jobs.find((row) => hasAll(jobText(row), tokens));
  if (job) return { kind: "job", text: job.name };
  const place = feature.places.find((row) =>
    hasAll(`${row.label} ${row.trigger}`, tokens),
  );
  if (place) return { kind: "place", text: place.label };
  const held = feature.jobs.find(
    (row) => row.holderName && hasAll(row.holderName, tokens),
  );
  if (held?.holderName) return { kind: "holder", text: held.holderName };
  // Words spread across several things: the job holding the most of them explains it.
  let best: DirectoryJob | null = null;
  let bestHits = 0;
  for (const row of feature.jobs) {
    const text = jobText(row).toLowerCase();
    const hits = tokens.filter((t) => text.includes(t)).length;
    if (hits > bestHits) {
      best = row;
      bestHits = hits;
    }
  }
  return best
    ? { kind: "job", text: best.name, partial: true }
    : { kind: "name", partial: true };
}

/** Sort key: the name itself, then one thing holding every word, then words spread out. */
export function matchStrength(reason: MatchReason): number {
  if ("partial" in reason && reason.partial) return 0;
  return reason.kind === "name" ? 2 : 1;
}
