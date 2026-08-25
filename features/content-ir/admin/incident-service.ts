/**
 * incident-service — the ONE browser read/resolve path for
 * `content_ir.kind_component_incident`.
 *
 * The incident queue is where a Shape's render failures accumulate from every
 * surface that renders it: the browser files compile / render / transform
 * failures (react/db-component/kindComponentIncident.ts → the
 * `log_kind_component_incident` RPC), and the aidream generic-floor alarm
 * files `generic_floor_render` when a kind reaches a reader through the
 * generic viewer because nothing is bound. The component-authoring agent reads
 * the same rows through `kindcomp_get_context` and closes them through
 * `kindcomp_resolve_incident` — so this surface and the agent are two doors
 * onto ONE queue, never two systems.
 *
 * Reads use `readAllRows`: the board shows counts and an admin diffs "what is
 * still open" against them, and a bare `.select()` silently caps at 1000.
 * Resolution is a direct guarded update — RLS (platform admin, or editor on
 * the kind) is the authorization layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { operationFailed } from "@/utils/errors";

export type KindIncidentClient = SupabaseClient<Database>;

/** Which failure a row records. Open-ended: a new producer must SHOW UP. */
export type KindIncidentErrorType =
  | "compile_error"
  | "render_throw"
  | "transform_error"
  | "generic_floor_render"
  | (string & {});

export interface KindIncidentRecord {
  id: string;
  kindDefinitionId: string;
  kind: string;
  errorType: KindIncidentErrorType;
  errorMessage: string;
  errorStack: string | null;
  platform: string | null;
  role: string | null;
  componentKey: string | null;
  componentVersion: number | null;
  componentSemver: string | null;
  /** Keys + value TYPES only for browser-filed rows — never a viewer's values. */
  dataSnapshot: Json;
  browserInfo: Json;
  resolved: boolean;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  /** How many times this exact failure has been re-observed. */
  occurrences: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  /** Distinct routes the failure was observed on (capped by the producer). */
  routes: string[];
  /** Which producer filed it — `browser_render_alarm` / `creator_alarm`. */
  signal: string | null;
}

// Typed `string`, not a literal: a long column list makes PostgREST's generic
// select-parser explode into a deep conditional type (TS2589). The honest
// row shape is declared below and reasserted with `.returns<Row[]>()`.
const COLUMNS: string =
  "id,kind_definition_id,kind,error_type,error_message,error_stack,platform,role," +
  "component_key,component_version,component_semver,data_snapshot,browser_info," +
  "resolved,resolved_at,resolution_notes,created_at,metadata";

type Row = Pick<
  Database["content_ir"]["Tables"]["kind_component_incident"]["Row"],
  | "id"
  | "kind_definition_id"
  | "kind"
  | "error_type"
  | "error_message"
  | "error_stack"
  | "platform"
  | "role"
  | "component_key"
  | "component_version"
  | "component_semver"
  | "data_snapshot"
  | "browser_info"
  | "resolved"
  | "resolved_at"
  | "resolution_notes"
  | "created_at"
  | "metadata"
>;

function readMeta(metadata: Json): {
  occurrences: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  routes: string[];
  signal: string | null;
} {
  const meta =
    metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, Json>)
      : {};
  const rawRoutes = meta.routes;
  return {
    occurrences: typeof meta.occurrences === "number" ? meta.occurrences : 1,
    firstSeenAt: typeof meta.first_seen_at === "string" ? meta.first_seen_at : null,
    lastSeenAt: typeof meta.last_seen_at === "string" ? meta.last_seen_at : null,
    routes: Array.isArray(rawRoutes)
      ? rawRoutes.filter((entry): entry is string => typeof entry === "string")
      : [],
    signal: typeof meta.signal === "string" ? meta.signal : null,
  };
}

function toRecord(row: Row): KindIncidentRecord {
  const meta = readMeta(row.metadata);
  return {
    id: row.id,
    kindDefinitionId: row.kind_definition_id,
    kind: row.kind,
    errorType: row.error_type ?? "unknown",
    errorMessage: row.error_message ?? "(no message)",
    errorStack: row.error_stack,
    platform: row.platform,
    role: row.role,
    componentKey: row.component_key,
    componentVersion: row.component_version,
    componentSemver: row.component_semver,
    dataSnapshot: row.data_snapshot,
    browserInfo: row.browser_info,
    resolved: Boolean(row.resolved),
    resolvedAt: row.resolved_at,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    ...meta,
  };
}

export type IncidentScope = "open" | "resolved" | "all";

/** Every incident in scope, newest first. Complete — never a silent 1000 cap. */
export async function listKindIncidents(
  client: KindIncidentClient,
  scope: IncidentScope = "open",
): Promise<KindIncidentRecord[]> {
  try {
    const rows = await readAllRows<Row>(
      ({ from, to }) => {
        let query = client
          .schema("content_ir")
          .from("kind_component_incident")
          .select(COLUMNS, { count: "exact" })
          .is("deleted_at", null);
        if (scope === "open") query = query.eq("resolved", false);
        if (scope === "resolved") query = query.eq("resolved", true);
        return query
          .order("created_at", { ascending: false })
          // Paginated ORDER BY must end in a unique column or pages overlap.
          .order("id", { ascending: false })
          .range(from, to)
          .returns<Row[]>();
      },
      { label: `content_ir.kind_component_incident (${scope})` },
    );
    return rows.map(toRecord);
  } catch (error) {
    throw operationFailed("load the Shape incident queue", error);
  }
}

/**
 * Close one incident. The same act `kindcomp_resolve_incident` performs for an
 * agent — one queue, two doors.
 */
export async function resolveKindIncident(
  client: KindIncidentClient,
  incidentId: string,
  resolutionNotes: string,
): Promise<void> {
  const note = resolutionNotes.trim();
  if (!note) {
    throw new Error("Say what was done — a resolution without a note is a guess.");
  }
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) {
    throw operationFailed("verify who is resolving this incident", authError);
  }
  const { error } = await client
    .schema("content_ir")
    .from("kind_component_incident")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: authData.user?.id ?? null,
      resolution_notes: note,
    })
    .eq("id", incidentId);
  if (error) throw operationFailed("resolve this Shape incident", error);
}

/** Re-open a row closed by mistake (or superseded and still failing). */
export async function reopenKindIncident(
  client: KindIncidentClient,
  incidentId: string,
): Promise<void> {
  const { error } = await client
    .schema("content_ir")
    .from("kind_component_incident")
    .update({ resolved: false, resolved_at: null, resolved_by: null })
    .eq("id", incidentId);
  if (error) throw operationFailed("reopen this Shape incident", error);
}
