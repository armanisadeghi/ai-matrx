import "server-only";
import { createClient } from "@/utils/supabase/server";
import { getShareableResource } from "@/utils/permissions/registry";

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

export interface PublicFlashcard {
  id: string;
  front: string;
  back: string;
  card_kind?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  lesson?: string | null;
  position?: number | null;
}

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

/**
 * The types the indexable public lane serves. An allowlist, not "any public
 * registered type": a resource being public shouldn't auto-publish it to an
 * SEO-indexed page (e.g. a public `wc_claim`, `dm_conversation`, `file`, or
 * `conversation` is not community-library content). Add a type here only when it
 * has a public renderer and is genuinely meant for the SEO/community lane.
 */
const PUBLIC_LANE_TYPES = new Set<string>(["fc_set", "note", "message_template"]);

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
    const r = data as { success?: boolean; set?: Record<string, unknown>; cards?: PublicFlashcard[] } | null;
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

  // Generic path: read the base row through the registry, gate on public visibility.
  const scoped = (
    entry.schemaName
      ? (supabase as unknown as { schema: (s: string) => DynamicReadClient }).schema(entry.schemaName)
      : (supabase as unknown as DynamicReadClient)
  ) as DynamicReadClient;

  const { data, error } = await scoped
    .from(entry.tableName)
    .select("*")
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
