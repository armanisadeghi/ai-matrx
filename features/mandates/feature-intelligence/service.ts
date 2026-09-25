// features/mandates/feature-intelligence/service.ts
//
// ONE FEATURE'S JOBS, from the viewer's seat. The list is the member list door
// (`public.mnd_member_list`) — holder-neutral, so a workflow holder reads as
// plainly as an agent — narrowed to the feature's keys; the definition adds the
// output kind the list row does not carry.

import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import {
  callMandateMemberList,
  memberRowFromWire,
  type MandateMemberPageAnswer,
} from "../member-list/rpc";
import type { MandateMemberRow } from "../member-list/types";
import { featurePrefixes } from "./registry";
import type { FeatureIntelligenceRow, IntelligenceLevel } from "./types";

export interface FeatureIntelligenceQuery {
  /** Mandate-key prefix (`flashcards`, `research`). */
  feature: string;
  level: IntelligenceLevel;
  /** Organization level: the organization being managed. Person level: the
   * active organization whose rung answers "what runs for me". */
  organizationId: string | null;
  /** The viewer — decides whether the "mine" lane is worth asking. */
  userId: string | null;
}

const PAGE = 200;

/** A key belongs to a feature when its first segment is the feature. */
export function keyInFeature(mandateKey: string, feature: string): boolean {
  return featurePrefixes(feature).some((prefix) => mandateKey.startsWith(`${prefix}.`));
}

/**
 * The label without a leading feature name the page already shows
 * ("Flashcards — Generate Cards (topic)" → "Generate Cards (topic)").
 */
export function shortMandateName(name: string, featureLabel: string): string {
  const prefixes = [featureLabel, featureLabel.replace(/s$/, "")].filter(Boolean);
  for (const prefix of prefixes) {
    const match = name.match(
      new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—–:-]\\s*`, "i"),
    );
    if (match) return name.slice(match[0].length) || name;
  }
  return name;
}

async function pageOf(
  query: FeatureIntelligenceQuery,
  scope: string,
  prefix: string,
): Promise<MandateMemberRow[]> {
  const orgLevel = query.level === "organization";
  const rows: MandateMemberRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const answer = await callMandateMemberList<MandateMemberPageAnswer>({
      p_mode: "page",
      p_level: query.level,
      p_scope: scope,
      ...(orgLevel
        ? { p_org_id: query.organizationId ?? undefined }
        : { p_resolve_org_id: query.organizationId ?? undefined }),
      p_filters: { mandateKey: { kind: "text", value: `${prefix}.` } },
      p_sort: "name",
      p_dir: "asc",
      p_limit: PAGE,
      p_offset: offset,
    });
    rows.push(...answer.rows.map(memberRowFromWire));
    if (offset + answer.rows.length >= answer.total || answer.rows.length === 0) break;
  }
  return rows;
}

/**
 * Which lanes of the member list can hold this feature's jobs. Every lane is a
 * full-corpus read on the server (~2 s each), so the page asks only the lanes
 * the feature's visible definitions actually live in — usually one.
 */
export function lanesFor(
  defs: readonly { organization_id: string | null; created_by: string | null }[],
  systemOrgId: string,
  userId: string | null,
  level: IntelligenceLevel,
): string[] {
  const lanes = new Set<string>();
  for (const def of defs) {
    if (def.organization_id === systemOrgId) lanes.add("system");
    else if (level === "organization") lanes.add("orgs");
    else if (userId && def.created_by === userId) lanes.add("mine");
    else {
      lanes.add("orgs");
    }
  }
  return [...lanes];
}

export async function fetchFeatureIntelligence(
  query: FeatureIntelligenceQuery,
): Promise<FeatureIntelligenceRow[]> {
  // The feature's definitions the viewer can see (RLS), read first: they say
  // which lanes to ask and carry the output kind the list row does not.
  // A feature may own more than one key prefix (podcasts: `podcast` and
  // `podcast_client`) — each is read and merged.
  const prefixes = featurePrefixes(query.feature);
  const [defsByPrefix, systemOrgId] = await Promise.all([
    Promise.all(prefixes.map((prefix) => readAllRows(
      ({ from, to }) => mandateDefinitions(createClient())
        .select("mandate_key, output_kind, description, organization_id, created_by", { count: "exact" })
        .like("mandate_key", `${prefix}.%`)
        .is("deleted_at", null)
        .order("mandate_key", { ascending: true })
        .range(from, to),
      { label: `mandate definitions for ${prefix}` },
    ))),
    resolveSystemOrgId(),
  ]);
  const defsAll = defsByPrefix.flat();
  const featureDefs = defsAll.filter((row) => keyInFeature(row.mandate_key, query.feature));
  if (featureDefs.length === 0) return [];
  const defs = new Map(
    featureDefs.map((row) => [
      row.mandate_key,
      { outputKind: row.output_kind ?? null, description: row.description ?? null },
    ]),
  );

  const pages = await Promise.all(prefixes.flatMap((prefix) => {
    const prefixDefs = featureDefs.filter((row) => row.mandate_key.startsWith(`${prefix}.`));
    return lanesFor(prefixDefs, systemOrgId, query.userId, query.level)
      .map((lane) => pageOf(query, lane, prefix));
  }));
  const byId = new Map<string, MandateMemberRow>();
  for (const row of pages.flat()) {
    if (keyInFeature(row.mandateKey, query.feature)) byId.set(row.id, row);
  }

  return [...byId.values()]
    .map((row) => ({
      ...row,
      shortName: shortMandateName(row.name, row.featureLabel),
      outputKind: defs.get(row.mandateKey)?.outputKind ?? null,
      description: defs.get(row.mandateKey)?.description ?? null,
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName));
}
