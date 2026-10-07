// features/education/kits/kitScope.ts
//
// A STUDY KIT HOLDS ANY NUMBER OF SOURCES (Arman, 2026-10-07: "Absolutely!").
//
// The kit is a `scope` under a per-org "Study kit" scope type — the same
// primitive a class is (`classes/constants.ts`), zero new tables:
//   - kit identity  = the scope row (its name is the kit's name);
//   - a Source      = a plain edge  source → ('scope', kitId), metadata `kitSource: true`;
//   - a study aid   = a `member` edge aid → ('scope', kitId), metadata
//                     `educationKit: true` + `targetKind` (the manual-member
//                     shape `kitService` already reads);
//   - lineage       = each generated aid also links a `source` edge to EVERY
//                     Source, stamped `kitId`, so "Made from" names each one and
//                     the anchor-kit reads leave it to this kit.
// Removing a Source archives its edge (`assoc_remove` tombstones it); the
// Source itself is untouched.
//
// Kits made before 2026-10-07 have no scope: their one anchor IS the kit. The
// first time one takes another Source it is PROMOTED (`promoteAnchorKit` in
// kitService.ts): a kit scope is made, the anchor becomes its first Source, and
// every aid is copied in — nothing is deleted.

"use client";

import { associationsService } from "@/features/scopes/service/associationsService";
import { scopeStore } from "@/features/scopes/service/scopeStore";
import { readScopeTypes, readScopesById, readTypeScopesPage } from "@/features/scopes/service/storeScopeReads";
import { organizationsIAmIn } from "@/features/organizations/organizationsIAmIn";
import { isScopesRpcErr } from "@/features/scopes/types";
import { peekHref } from "@/features/organizations/peek/peekHref";
import { keepSource } from "@/features/sources/api/sourcesApi";
import type { Json } from "@/types/database.types";

/** Reserved slug of the auto-seeded "Study kit" scope type (one per org). */
export const KIT_SCOPE_TYPE_SLUG = "study-kit";

const KIT_SCOPE_TYPE_SEED = {
  labelSingular: "Study kit",
  labelPlural: "Study kits",
  icon: "package",
  color: "#6366f1",
  description: "Study kits: the sources for one subject and every study aid made from them.",
} as const;

/** The association token a kit is addressed by. */
export const KIT_TOKEN = "scope";

/** The server names a stored file `cld_file` in places; on an edge it is a `file`. */
export function kitSourceToken(resourceType: string): string {
  return resourceType === "cld_file" ? "file" : resourceType;
}

export interface KitSource {
  edgeId: string;
  /** Association token ("file", "processed_document", "note"…). */
  type: string;
  id: string;
  title: string;
  /** Where the Source opens, when the registry knows. */
  href: string | null;
  createdAt: string;
}

export interface KitScopeRow {
  id: string;
  name: string;
  organizationId: string;
}

function meta(value: Json | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** True for the edge that files a Source under a kit. */
export function isKitSourceEdge(edge: { metadata?: Json; role?: string | null }): boolean {
  return meta(edge.metadata).kitSource === true;
}

/** The kit an anchor's lineage/member edge was handed to, if any. */
export function edgeKitId(metadata: Json | undefined): string | null {
  const v = meta(metadata).kitId;
  return typeof v === "string" && v ? v : null;
}

async function ensureKitScopeType(orgId: string): Promise<string> {
  const types = await readScopeTypes([orgId], false);
  if (!types.ok) throw new Error("Could not read your study kit settings. Try again.");
  const found = types.data.types.find((t) => t.slug === KIT_SCOPE_TYPE_SLUG && t.organization_id === orgId)
    ?? types.data.types.find((t) => t.slug === KIT_SCOPE_TYPE_SLUG);
  if (found) return found.id;
  const made = await scopeStore.createScopeType({
    org_id: orgId,
    label_singular: KIT_SCOPE_TYPE_SEED.labelSingular,
    label_plural: KIT_SCOPE_TYPE_SEED.labelPlural,
    icon: KIT_SCOPE_TYPE_SEED.icon,
    color: KIT_SCOPE_TYPE_SEED.color,
    description: KIT_SCOPE_TYPE_SEED.description,
    slug: KIT_SCOPE_TYPE_SLUG,
  });
  if (isScopesRpcErr(made)) throw new Error("Could not set up study kits in this workspace. Try again.");
  return made.data.id;
}

/** Make a new, empty kit in this organization. */
export async function createKitScope(orgId: string, name: string): Promise<KitScopeRow> {
  const typeId = await ensureKitScopeType(orgId);
  const clean = name.trim() || "Study kit";
  const made = await scopeStore.createScope({
    org_id: orgId,
    type_id: typeId,
    name: clean,
    // Kit names repeat ("Chapter 3"); the slug only has to be unique.
    slug: `kit-${crypto.randomUUID().slice(0, 12)}`,
  });
  if (isScopesRpcErr(made)) throw new Error("Could not create the study kit. Try again.");
  return { id: made.data.id, name: clean, organizationId: orgId };
}

/** EVERY kit scope the person is in, across all their organizations (aids or not). */
export async function listKitScopes(): Promise<KitScopeRow[]> {
  const orgs = await organizationsIAmIn();
  if (!orgs || orgs.size === 0) return [];
  const types = await readScopeTypes([...orgs], false);
  if (!types.ok) throw new Error("Could not read your study kits. Try again.");
  const kitTypes = types.data.types.filter((t) => t.slug === KIT_SCOPE_TYPE_SLUG);
  const rows: KitScopeRow[] = [];
  for (const type of kitTypes) {
    for (let offset: number | null = 0; offset !== null; ) {
      const page = await readTypeScopesPage(type.id, offset);
      if (!page.ok) throw new Error("Could not read your study kits. Try again.");
      for (const s of page.data.scopes) {
        rows.push({ id: s.id, name: s.name?.trim() || "Study kit", organizationId: s.organization_id });
      }
      offset = page.data.nextOffset;
    }
  }
  return rows;
}

export async function readKitScope(kitId: string): Promise<KitScopeRow | null> {
  const res = await readScopesById([kitId]);
  if (!res.ok) throw new Error("Could not read this study kit.");
  const row = res.data.find((r) => r.id === kitId);
  if (!row) return null;
  return { id: row.id, name: row.name?.trim() || "Study kit", organizationId: row.organization_id };
}

export async function renameKitScope(kitId: string, name: string): Promise<void> {
  const res = await scopeStore.updateScope({ scope_id: kitId, name });
  if (isScopesRpcErr(res)) throw new Error("Could not rename this study kit.");
}

/** Archive the kit itself (restorable); its Sources and aids stay saved. */
export async function archiveKitScope(kitId: string): Promise<void> {
  const res = await scopeStore.deleteScope(kitId);
  if (isScopesRpcErr(res)) throw new Error("Could not delete this study kit.");
}

/**
 * File one Source under a kit. A landed Source (`processed_document`) is kept
 * first through THE landing door, so new material picked in the Source input
 * is never left as a temporary draft.
 */
export async function addKitSource(
  kit: Pick<KitScopeRow, "id" | "organizationId">,
  source: { type: string; id: string; title: string },
): Promise<void> {
  const type = kitSourceToken(source.type);
  if (type === "processed_document") {
    await keepSource(source.id, { organizationId: kit.organizationId });
  }
  const res = await associationsService.add({
    sourceType: type,
    sourceId: source.id,
    targetType: KIT_TOKEN,
    targetId: kit.id,
    orgId: kit.organizationId,
    label: source.title,
    metadata: { kitSource: true, title: source.title },
  });
  if (!res.ok) throw new Error(`Could not add ${source.title} to the kit.`);
}

/** Take a Source out of a kit (the edge is archived; the Source stays saved). */
export async function removeKitSource(kitId: string, source: Pick<KitSource, "type" | "id">): Promise<void> {
  const res = await associationsService.remove({
    sourceType: source.type,
    sourceId: source.id,
    targetType: KIT_TOKEN,
    targetId: kitId,
  });
  if (!res.ok) throw new Error("Could not remove this source from the kit.");
}

/** A kit's Sources from its incoming edges, oldest first (the order they were added). */
export function kitSourcesFromEdges(
  edges: readonly {
    id: string;
    direction: string;
    otherType: string;
    otherId: string;
    label?: string | null;
    metadata?: Json;
    createdAt: string;
    role?: string | null;
  }[],
): KitSource[] {
  const seen = new Set<string>();
  return edges
    .filter((e) => e.direction === "incoming" && isKitSourceEdge(e))
    .filter((e) => {
      const key = `${e.otherType}:${e.otherId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => {
      const title = meta(e.metadata).title;
      return {
        edgeId: e.id,
        type: e.otherType,
        id: e.otherId,
        title: (typeof title === "string" && title.trim()) || e.label || "Source",
        href: e.otherType === "file" ? `/files/f/${e.otherId}` : (peekHref(e.otherType, e.otherId) ?? null),
        createdAt: e.createdAt,
      };
    });
}
