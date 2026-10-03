import "server-only";
import { createClient } from "@/utils/supabase/server";
import { getShareableResource } from "@/utils/permissions/registry";
import { PUBLIC_LANE_TYPES, publicLaneSelect } from "@/utils/permissions/publicLane";
// The public card shape is owned by the flashcards feature (both public lanes
// read it).
import type {
  PublicFlashcard,
  PublicFlashcardSetPayload,
} from "@/features/flashcards/data/publicDeck";
import {
  readSharedRecord,
  type SharedRecord,
} from "@/features/sharing/lenses/record-fields";

/**
 * Server loader for the indexable public viewer (`/p/e/[resourceType]/[id]`).
 *
 * The id IS the address; the resource's own `visibility='public'` IS the
 * authorization — no token. Returns null for anything that isn't publicly
 * viewable (private, missing, unregistered type), so the route 404s. This is the
 * SEO/community-library lane (P6-C browses into it); the token lane (`/s/[token]`,
 * noindex) stays separate.
 *
 * Reads run under the caller's session via the SSR client, so RLS is the floor:
 * anon sees only public rows (`pub_read`). For type-specific children (a set's
 * cards) it delegates to an anon SECURITY DEFINER read RPC; base rows are read
 * generically through the registry so a new public type Just Works.
 */

export interface PublicResource {
  resourceType: string;
  resourceId: string;
  displayLabel: string;
  title: string;
  description?: string;
  /** The public resource row (heavy/internal columns are not selected). */
  row: Record<string, unknown>;
  /** Ordered cards when the type is a flashcard set. */
  cards?: PublicFlashcard[];
  /** One table row's fields (access ladder T-40), as the database projected them. */
  record?: SharedRecord;
}

/** Minimal dynamic-schema read surface (registry resolves table names at runtime). */
interface DynamicReadClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
      };
    };
  };
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

export async function loadPublicResource(
  resourceType: string,
  id: string,
): Promise<PublicResource | null> {
  const entry = getShareableResource(resourceType);
  if (!entry || !PUBLIC_LANE_TYPES.has(entry.resourceType)) return null;

  const supabase = await createClient();

  // Flashcard sets: rich anon read (set + ordered cards) via SECURITY DEFINER RPC.
  if (entry.resourceType === "fc_set") {
    const { data } = await supabase.rpc("get_public_flashcard_set", { p_set_id: id });
    const r = data as PublicFlashcardSetPayload | null;
    if (!r?.success || !r.set) return null;
    return {
      resourceType: "fc_set",
      resourceId: id,
      displayLabel: entry.displayLabel,
      title: firstString(r.set, ["name", "title"]) ?? "Flashcard set",
      description: firstString(r.set, ["description"]),
      row: r.set,
      cards: r.cards ?? [],
    };
  }

  // One table row (access ladder T-40): published to the web opens for anyone, signed in or not;
  // otherwise the signed-in person the one check admits (a person share) opens it at their rung.
  // `public.record_public_view` decides both and projects the fields; anything else is not found.
  if (entry.resourceType === "record") {
    const { data, error } = await supabase.rpc("record_public_view", { p_record_id: id });
    if (error) {
      console.error("[loadPublicResource] record_public_view:", error.message);
      return null;
    }
    const payload = data as { success?: boolean; record?: unknown } | null;
    const record = payload?.success ? readSharedRecord(payload.record) : null;
    if (!record) return null;
    return {
      resourceType: "record",
      resourceId: id,
      displayLabel: record.labelSingular,
      title: record.title,
      description: `A ${record.labelSingular.toLowerCase()} from ${record.tableName}.`,
      row: {},
      record,
    };
  }

  // Generic path: read the base row through the registry, gate on public visibility.
  const scoped = (
    entry.schemaName
      ? (supabase as unknown as { schema: (s: string) => DynamicReadClient }).schema(entry.schemaName)
      : (supabase as unknown as DynamicReadClient)
  ) as DynamicReadClient;

  // The columns are NAMED, never `*` (DD-186): `anon` may read only the columns
  // these tables declare to it, and `select=*` from a signed-out visitor is
  // refused outright (42501) — it also used to hand the browser `created_by`,
  // `organization_id`, `metadata` and `version` a round trip before the
  // projection below discarded them. The register is `PUBLIC_LANE_COLUMNS`.
  const { data, error } = await scoped
    .from(entry.tableName)
    .select(publicLaneSelect(entry.resourceType))
    .eq(entry.idColumn, id)
    .maybeSingle<Record<string, unknown>>();

  if (error || !data) return null;

  const isPublic = entry.isPublicColumn
    ? data[entry.isPublicColumn] === true
    : data["visibility"] === "public";
  if (!isPublic) return null;

  // Project ONLY display-safe fields to the client — never dump the whole row
  // (metadata jsonb, org/owner ids, file paths, hashes) to a public page.
  const safeRow: Record<string, unknown> = {};
  const content = firstString(data, ["content", "body", "text"]);
  if (content) safeRow.content = content;

  return {
    resourceType: entry.resourceType,
    resourceId: id,
    displayLabel: entry.displayLabel,
    title: firstString(data, ["name", "title", "label"]) ?? entry.displayLabel,
    description: firstString(data, ["description", "summary", "tagline"]),
    row: safeRow,
  };
}
