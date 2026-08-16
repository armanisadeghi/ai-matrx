/**
 * Saved Requests — a named, versioned, re-runnable invocation.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE REPRESENTATION DECISION (Lane 4, "choose the smallest canonical
 * composition"). Inventory, then the ruling:
 *
 *   • `agent.shortcut` — "a stored, first-class invocation of a specific agent
 *     version" carrying label/description, agent + version pin, the whole
 *     persisted `AgentExecutionConfig` (`default_user_input`,
 *     `default_variables`, `context_overrides`, `llm_overrides`), a `metadata`
 *     JSONB, a `version` int with history capture, RLS, soft delete, and an
 *     existing duplicate RPC.  ← CHOSEN.
 *   • `agent_apps` — a published multi-surface APP with its own routing and
 *     public renderer. Far more than a saved request; it *consumes* the same
 *     config bundle rather than being a smaller form of it.
 *   • `sch_task` + `sch_agent_task` — already the right home for a SCHEDULED
 *     run and only meaningful with a trigger. A saved request that is never
 *     scheduled would be a task with no trigger; scheduling stays a handoff
 *     INTO this existing engine, not a second copy of it.
 *   • workflow inputs — a workflow's input contract, not an invocation.
 *   • `prompts` / `prompt_templates` — RETIRED. Not candidates. Never revived.
 *
 * So: a Saved Request IS an `agent.shortcut` row filed under the one seeded
 * category `ai-work-saved-requests` (migration
 * `mtx_ai_work_saved_requests_category.sql`). No new table, no new RPC, no
 * second store. The AI-Work-specific extras that the shortcut columns do not
 * already model — the destination, the run's added skills, and the
 * project/task/War Room homes — live under the reserved `metadata.ai_work`
 * key, which is what that column exists for.
 *
 * `enabled_features` is forced to `[]` so a saved request NEVER leaks into the
 * context menus and quick-action rails that ordinary shortcuts populate. A
 * saved request is reached from AI Work, nowhere else.
 *
 * Versioning is the canonical `version` int + `guardedUpdate` compare-and-swap;
 * the `_history` trigger on `agent.shortcut` keeps every prior revision in
 * `history.row_versions`. No bespoke revision table.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import type { Json } from "@/types/database.types";
import type { WorkDestinationId } from "./destinations";

/** The one platform-seeded category that marks a shortcut row as a saved request. */
export const SAVED_REQUEST_CATEGORY_ID =
  "3f2d5c8a-1b47-4e6d-9c0f-7a5e2d13b904";

/**
 * Where a finished run should live. Applied as canonical association edges.
 * The token set is deliberately narrow: these three are the platform's work
 * containers, and `project`/`task` are `AssociationTargetType`s the canonical
 * `assoc_add` accepts, while `war_room` routes through its own owning mapper.
 */
export type WorkHomeToken = "project" | "task" | "war_room";

export interface SavedRequestHome {
  token: WorkHomeToken;
  id: string;
  label: string;
}

const HOME_TOKEN_SET = new Set<string>(["project", "task", "war_room"]);

export interface SavedRequest {
  id: string;
  label: string;
  description: string | null;
  /** The plain-language request text. Stored in `default_user_input`. */
  requestText: string;
  agentId: string | null;
  useLatest: boolean;
  destination: WorkDestinationId;
  /** Registry skill UUIDs added to the run on top of the agent's own tiers. */
  skillIds: string[];
  homes: SavedRequestHome[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** The `metadata.ai_work` sub-object. Tolerantly read — never assumed present. */
interface AiWorkMetadata {
  kind?: string;
  destination?: string;
  skill_ids?: unknown;
  homes?: unknown;
}

const SAVED_REQUEST_COLUMNS =
  "id, label, description, default_user_input, agent_id, use_latest, metadata, version, created_at, updated_at";

interface SavedRequestRow {
  id: string;
  label: string;
  description: string | null;
  default_user_input: string | null;
  agent_id: string | null;
  use_latest: boolean;
  metadata: Json;
  version: number;
  created_at: string;
  updated_at: string;
}

function readAiWork(metadata: Json): AiWorkMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const nested = (metadata as Record<string, unknown>).ai_work;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return {};
  }
  return nested as AiWorkMetadata;
}

function readHomes(value: unknown): SavedRequestHome[] {
  if (!Array.isArray(value)) return [];
  const homes: SavedRequestHome[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.token !== "string" || typeof row.id !== "string") continue;
    if (!HOME_TOKEN_SET.has(row.token)) continue;
    homes.push({
      token: row.token as WorkHomeToken,
      id: row.id,
      label: typeof row.label === "string" ? row.label : row.id,
    });
  }
  return homes;
}

function readSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toSavedRequest(row: SavedRequestRow): SavedRequest {
  const aiWork = readAiWork(row.metadata);
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    requestText: row.default_user_input ?? "",
    agentId: row.agent_id,
    useLatest: row.use_latest,
    destination: (aiWork.destination as WorkDestinationId) ?? "ai-matrx",
    skillIds: readSkillIds(aiWork.skill_ids),
    homes: readHomes(aiWork.homes),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildMetadata(input: {
  destination: WorkDestinationId;
  skillIds: string[];
  homes: SavedRequestHome[];
}): Json {
  return {
    ai_work: {
      kind: "saved_request",
      destination: input.destination,
      skill_ids: input.skillIds,
      homes: input.homes.map((home) => ({
        token: home.token,
        id: home.id,
        label: home.label,
      })),
    },
  } as unknown as Json;
}

function shortcuts() {
  return createClient().schema("agent").from("shortcut");
}

/**
 * Every saved request the caller owns, newest first. RLS already scopes rows to
 * what the user may read; the `created_by` filter narrows that to MINE, which
 * is the only scope `/work/requests` offers today (see THE VIEW LAW — a bare
 * RLS-filtered list is not a scope).
 */
export async function listSavedRequests(
  userId: string,
): Promise<SavedRequest[]> {
  const { data, error } = await shortcuts()
    .select(SAVED_REQUEST_COLUMNS)
    .eq("category_id", SAVED_REQUEST_CATEGORY_ID)
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as SavedRequestRow[]).map(toSavedRequest);
}

export async function readSavedRequest(
  id: string,
): Promise<SavedRequest | null> {
  const { data, error } = await shortcuts()
    .select(SAVED_REQUEST_COLUMNS)
    .eq("id", id)
    .eq("category_id", SAVED_REQUEST_CATEGORY_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toSavedRequest(data as unknown as SavedRequestRow) : null;
}

export interface SavedRequestInput {
  label: string;
  description: string | null;
  requestText: string;
  agentId: string;
  destination: WorkDestinationId;
  skillIds: string[];
  homes: SavedRequestHome[];
}

/**
 * Create through the canonical `agx_create_shortcut` RPC (which owns the
 * personal-scope and version-pin rules), then write the request's own fields
 * onto the fresh row. `enabled_features: []` keeps it out of every shortcut
 * rail.
 */
export async function createSavedRequest(
  input: SavedRequestInput,
): Promise<SavedRequest> {
  const supabase = createClient();
  const { data: newId, error: createError } = await supabase.rpc(
    "agx_create_shortcut",
    {
      p_agent_id: input.agentId,
      p_category_id: SAVED_REQUEST_CATEGORY_ID,
      p_label: input.label,
      p_use_latest: true,
    },
  );
  if (createError) throw createError;
  if (typeof newId !== "string") {
    throw new Error("agx_create_shortcut returned no id");
  }

  const { data, error } = await shortcuts()
    .update({
      description: input.description,
      default_user_input: input.requestText,
      enabled_features: [] as unknown as Json,
      display_mode: "chat-assistant",
      allow_chat: true,
      metadata: buildMetadata(input),
    })
    .eq("id", newId)
    .select(SAVED_REQUEST_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Saved request was created but could not be read");
  return toSavedRequest(data as unknown as SavedRequestRow);
}

export type SaveResult =
  | { status: "saved"; request: SavedRequest }
  | { status: "conflict"; current: SavedRequest }
  | { status: "not_found" };

/** Compare-and-swap on the canonical `version` column. Never last-write-wins. */
export async function updateSavedRequest(
  id: string,
  expectedVersion: number,
  input: SavedRequestInput,
): Promise<SaveResult> {
  const result = await guardedUpdate<SavedRequestRow>({
    expectedVersion,
    applyUpdate: async ({ expectedVersion: expected, nextVersion }) => {
      const response = await shortcuts()
        .update({
          label: input.label,
          description: input.description,
          default_user_input: input.requestText,
          agent_id: input.agentId,
          metadata: buildMetadata(input),
          version: nextVersion,
        })
        .eq("id", id)
        .eq("version", expected)
        .is("deleted_at", null)
        .select(SAVED_REQUEST_COLUMNS)
        .maybeSingle();
      return {
        data: (response.data as SavedRequestRow | null) ?? null,
        error: response.error,
      };
    },
    fetchCurrent: async () => {
      const response = await shortcuts()
        .select(SAVED_REQUEST_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      return {
        data: (response.data as SavedRequestRow | null) ?? null,
        error: response.error,
      };
    },
  });

  if (result.status === "saved") {
    return { status: "saved", request: toSavedRequest(result.row) };
  }
  if (result.status === "conflict") {
    return { status: "conflict", current: toSavedRequest(result.currentRow) };
  }
  return { status: "not_found" };
}

/** Soft delete — the row stays recoverable, exactly like every other entity. */
export async function deleteSavedRequest(id: string): Promise<void> {
  const { error } = await shortcuts()
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
