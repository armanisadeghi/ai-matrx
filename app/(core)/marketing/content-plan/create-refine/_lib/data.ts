/**
 * app/(core)/marketing/content-plan/create-refine/_lib/data.ts
 *
 * The two reads/writes the Site Setup view needs that the existing
 * content-plan service layer does not already expose:
 *
 *  1. the ARCHETYPE LIBRARY — the platform builtins on the system-org
 *     `plan.profile` row (`vertical='platform-archetypes'`, `visibility='public'`
 *     so `pub_read` lets every authenticated caller see it) merged with any
 *     archetypes the site's own org declares, org winning on a key clash. Same
 *     two-tier merge aidream's `load_archetypes` performs.
 *  2. recording the COMMITTED work order on `web.site.settings.content_plan.archetype`
 *     — the exact shape aidream's `_record_site_archetype` writes, so the
 *     server-side foundation checklist and this view read the same fact. The
 *     existing `content_plan` settings block (which carries `vertical`) is
 *     MERGED, never replaced.
 *
 * Plan NODE writes are not duplicated here — they go through the feature's one
 * write path (`features/marketing/content-plan/data/service.ts#createPlanNode`).
 * Reads go direct to Supabase under RLS.
 */
import { supabase } from "@/utils/supabase/client";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
} from "@/utils/supabase/webDb";

import {
  ARCHETYPE_MAP_KEY,
  BUILTIN_ARCHETYPE_VERTICAL,
  SITE_ARCHETYPE_KEY,
  SITE_SETTINGS_KEY,
  parseArchetypeMap,
  type Archetype,
} from "./archetypes";

export interface ArchetypeLibrary {
  archetypes: Archetype[];
  /** Non-fatal parse failures, surfaced in the UI rather than swallowed. */
  problems: string[];
}

/**
 * Every archetype the site can be built from. A malformed org archetype does
 * NOT hide the builtins — it is reported as a problem beside them (loud
 * recovery), because losing the whole library to one bad row is worse than
 * showing the rest with a warning.
 */
export async function loadArchetypeLibrary(
  organizationId: string | null,
  signal?: AbortSignal,
): Promise<ArchetypeLibrary> {
  await requireAuthenticatedSupabaseSession(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const response = await supabase
    .schema("plan")
    .from("profile")
    .select("id, organization_id, vertical, template_map")
    .is("deleted_at", null)
    .abortSignal(abortSignal);
  if (response.error) throw response.error;

  const byKey = new Map<string, Archetype>();
  const problems: string[] = [];

  const ingest = (
    rows: { vertical: string; template_map: unknown }[],
    source: (vertical: string) => string,
  ) => {
    for (const row of rows) {
      const map = (row.template_map ?? {}) as Record<string, unknown>;
      try {
        for (const archetype of parseArchetypeMap(
          map[ARCHETYPE_MAP_KEY],
          `plan.profile[${row.vertical}]`,
          source(row.vertical),
        )) {
          byKey.set(archetype.key, archetype);
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const rows = response.data ?? [];
  // Builtins first so an org archetype of the same key shadows it.
  ingest(
    rows.filter((row) => row.vertical === BUILTIN_ARCHETYPE_VERTICAL),
    () => "builtin",
  );
  if (organizationId) {
    ingest(
      rows.filter(
        (row) =>
          row.organization_id === organizationId &&
          row.vertical !== BUILTIN_ARCHETYPE_VERTICAL,
      ),
      (vertical) => vertical,
    );
  }

  // Smallest shape first. Alphabetical would put "Authority base — 100 to 1000
  // pages" at the top of a brand-new site's list, which is the wrong default to
  // land on; people scale up, not down.
  const size = (archetype: Archetype) => {
    const match = /\d+/.exec(archetype.pageEstimate);
    return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
  };

  return {
    archetypes: [...byKey.values()].sort(
      (a, b) => size(a) - size(b) || a.label.localeCompare(b.label),
    ),
    problems,
  };
}

/** The work order previously committed for a site, if any. */
export interface CommittedArchetype {
  key: string;
  counts: Record<string, number>;
  instantiatedAt: string | null;
}

export function readCommittedArchetype(
  settings: unknown,
): CommittedArchetype | null {
  if (!settings || typeof settings !== "object") return null;
  const block = (settings as Record<string, unknown>)[SITE_SETTINGS_KEY];
  if (!block || typeof block !== "object") return null;
  const raw = (block as Record<string, unknown>)[SITE_ARCHETYPE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.key !== "string") return null;
  const counts: Record<string, number> = {};
  if (row.counts && typeof row.counts === "object") {
    for (const [key, value] of Object.entries(row.counts as Record<string, unknown>)) {
      if (typeof value === "number") counts[key] = value;
    }
  }
  return {
    key: row.key,
    counts,
    instantiatedAt:
      typeof row.instantiated_at === "string" ? row.instantiated_at : null,
  };
}

/**
 * Record the committed work order on the site. Read-modify-write of the
 * `settings` jsonb (PostgREST has no partial-jsonb update) — the read is
 * immediately before the write and only the `content_plan.archetype` key is
 * touched, so a concurrent edit to another settings key is the only loss
 * window and the caller re-reads the row afterwards.
 */
export async function recordSiteArchetype(args: {
  siteId: string;
  archetypeKey: string;
  counts: Record<string, number>;
}): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const current = await db
    .from("site")
    .select("settings")
    .eq("id", args.siteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("This site no longer exists.");

  const settings = { ...((current.data.settings ?? {}) as Record<string, unknown>) };
  const block = {
    ...((settings[SITE_SETTINGS_KEY] ?? {}) as Record<string, unknown>),
  };
  block[SITE_ARCHETYPE_KEY] = {
    key: args.archetypeKey,
    counts: args.counts,
    instantiated_at: new Date().toISOString(),
  };
  settings[SITE_SETTINGS_KEY] = block;

  const written = await db
    .from("site")
    .update({ settings })
    .eq("id", args.siteId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (written.error) throw written.error;
  if (!written.data) {
    throw new Error(
      "The plan was created, but the site shape could not be recorded (no write access to this site).",
    );
  }
}
