// features/mandates/feature-intelligence/service.ts
//
// ONE FEATURE'S JOBS, from the viewer's seat. The list is the member list door
// (`public.mnd_member_list`) — holder-neutral, so a workflow holder reads as
// plainly as an agent — narrowed to the feature's keys; the definition adds the
// output kind the list row does not carry.

import { createClient } from "@/utils/supabase/client";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import {
  callMandateMemberList,
  memberRowFromWire,
  type MandateMemberPageAnswer,
} from "../member-list/rpc";
import type { MandateMemberRow } from "../member-list/types";
import type { FeatureIntelligenceRow, IntelligenceLevel } from "./types";

export interface FeatureIntelligenceQuery {
  /** Mandate-key prefix (`flashcards`, `research`). */
  feature: string;
  level: IntelligenceLevel;
  /** Organization level: the organization being managed. Person level: the
   * active organization whose rung answers "what runs for me". */
  organizationId: string | null;
}

const PAGE = 200;

/** A key belongs to a feature when its first segment is the feature. */
export function keyInFeature(mandateKey: string, feature: string): boolean {
  return mandateKey.startsWith(`${feature}.`);
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
): Promise<MandateMemberRow[]> {
  const orgLevel = query.level === "organization";
  const answer = await callMandateMemberList<MandateMemberPageAnswer>({
    p_mode: "page",
    p_level: query.level,
    p_scope: scope,
    ...(orgLevel
      ? { p_org_id: query.organizationId ?? undefined }
      : { p_resolve_org_id: query.organizationId ?? undefined }),
    p_filters: { mandateKey: { kind: "text", value: `${query.feature}.` } },
    p_sort: "name",
    p_dir: "asc",
    p_limit: PAGE,
    p_offset: 0,
  });
  return answer.rows.map(memberRowFromWire);
}

export async function fetchFeatureIntelligence(
  query: FeatureIntelligenceQuery,
): Promise<FeatureIntelligenceRow[]> {
  // The platform's own jobs, plus the ones the viewer (or the organization)
  // made or was given in this feature. The door's scopes do not overlap by
  // meaning but may by row, so rows are merged by id.
  const scopes =
    query.level === "organization"
      ? ["system", "orgs"]
      : ["system", "mine", "shared", "orgs"];
  const pages = await Promise.all(scopes.map((scope) => pageOf(query, scope)));
  const byId = new Map<string, MandateMemberRow>();
  for (const row of pages.flat()) {
    if (keyInFeature(row.mandateKey, query.feature)) byId.set(row.id, row);
  }
  const rows = [...byId.values()];
  if (rows.length === 0) return [];

  const { data, error } = await mandateDefinitions(createClient())
    .select("mandate_key, output_kind, description")
    .in(
      "mandate_key",
      rows.map((row) => row.mandateKey),
    )
    .is("deleted_at", null);
  if (error) throw new Error(`Job definitions: ${error.message}`);
  const defs = new Map(
    (data ?? []).map((row) => [
      row.mandate_key,
      { outputKind: row.output_kind ?? null, description: row.description ?? null },
    ]),
  );

  return rows
    .map((row) => ({
      ...row,
      shortName: shortMandateName(row.name, row.featureLabel),
      outputKind: defs.get(row.mandateKey)?.outputKind ?? null,
      description: defs.get(row.mandateKey)?.description ?? null,
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName));
}
