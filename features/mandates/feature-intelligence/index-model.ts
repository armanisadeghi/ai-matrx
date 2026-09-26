// features/mandates/feature-intelligence/index-model.ts
//
// THE /intelligence DIRECTORY, as data: one card per feature — its jobs, the
// places they run, and (once the member list answers) what runs each one from
// the viewer's seat. Search reads all of it, so typing a job's name, what it
// does, the screen it runs on, or the agent/workflow that runs it finds the
// feature that owns it. Pure: the component and the tests share it.

import type { MandateStatus } from "@/features/mandates/status/mandate-status";
import {
  DECLARED_FEATURES,
  featureDisplayName,
  featureForKey,
  isFixtureFeature,
} from "./registry";
import { shortMandateName } from "./service";

/** One job as the directory needs it. */
export interface DirectoryJob {
  key: string;
  /** Name without the feature label the card already shows. */
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
  feature: string;
  label: string;
  jobs: DirectoryJob[];
  places: DirectoryPlace[];
  declared: boolean;
  /** A test/parity fixture prefix — admins only, labeled as such. */
  fixture: boolean;
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
  const tail = key.slice(key.indexOf(".") + 1).replace(/[._-]+/g, " ").trim();
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : key;
}

export function buildDirectory(
  defs: readonly DirectoryDefinition[],
  holders: readonly DirectoryHolder[] = [],
): DirectoryFeature[] {
  const byKey = new Map(holders.map((row) => [row.mandateKey, row]));
  const jobsByFeature = new Map<string, DirectoryJob[]>();
  for (const def of defs) {
    const feature = featureForKey(def.mandate_key);
    const label = featureDisplayName(feature);
    const holder = byKey.get(def.mandate_key);
    const job: DirectoryJob = {
      key: def.mandate_key,
      name: def.label ? shortMandateName(def.label, label) : humanizeKeyTail(def.mandate_key),
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
    const list = jobsByFeature.get(feature) ?? [];
    list.push(job);
    jobsByFeature.set(feature, list);
  }
  for (const list of jobsByFeature.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const declared: DirectoryFeature[] = DECLARED_FEATURES.map((entry) => ({
    feature: entry.feature,
    label: entry.label,
    jobs: jobsByFeature.get(entry.feature) ?? [],
    places: entry.places.map((place) => ({ label: place.label, trigger: place.trigger })),
    declared: true,
    fixture: false,
  }));
  const known = new Set(declared.map((row) => row.feature));
  const others: DirectoryFeature[] = [...jobsByFeature.entries()]
    .filter(([feature]) => !known.has(feature))
    .map(([feature, jobs]) => ({
      feature,
      label: featureDisplayName(feature),
      jobs,
      places: [],
      declared: false,
      fixture: isFixtureFeature(feature),
    }))
    .sort((a, b) => b.jobs.length - a.jobs.length || a.label.localeCompare(b.label));
  return [...declared, ...others];
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
  | { kind: "name" }
  | { kind: "job"; text: string }
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
export function matchFeature(feature: DirectoryFeature, query: string): MatchReason | null {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return { kind: "name" };
  const everything = [
    feature.label,
    ...feature.jobs.map((job) => `${jobText(job)} ${job.holderName ?? ""}`),
    ...feature.places.map((place) => `${place.label} ${place.trigger}`),
  ].join(" ");
  if (!hasAll(everything, tokens)) return null;
  if (hasAll(feature.label, tokens)) return { kind: "name" };
  const job = feature.jobs.find((row) => hasAll(jobText(row), tokens));
  if (job) return { kind: "job", text: job.name };
  const place = feature.places.find((row) => hasAll(`${row.label} ${row.trigger}`, tokens));
  if (place) return { kind: "place", text: place.label };
  const held = feature.jobs.find((row) => row.holderName && hasAll(row.holderName, tokens));
  if (held?.holderName) return { kind: "holder", text: held.holderName };
  // Words spread across several things: the best single hit still explains it.
  const partial = feature.jobs.find((row) => tokens.some((t) => jobText(row).toLowerCase().includes(t)));
  return partial ? { kind: "job", text: partial.name } : { kind: "name" };
}
