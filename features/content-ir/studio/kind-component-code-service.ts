/**
 * Browser persistence for DB-authored Shape components.
 *
 * `content_ir.kind_component` is the canonical source. Reads are complete and
 * ordered; writes are version-guarded so two editors can never silently
 * overwrite each other. RLS remains the authorization layer for both owner
 * and super-admin surfaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import { operationFailed } from "@/utils/errors";

export type KindComponentCodeClient = SupabaseClient<Database>;

export interface KindComponentCodeRecord {
  id: string;
  kindDefinitionId: string;
  platform: string;
  role: string;
  componentKey: string;
  source: string;
  componentSource: string | null;
  config: Json;
  isActive: boolean;
  isDefault: boolean;
  semver: string;
  version: number;
  updatedAt: string;
}

type KindComponentCodeRow = Pick<
  Database["content_ir"]["Tables"]["kind_component"]["Row"],
  | "id"
  | "kind_definition_id"
  | "platform"
  | "role"
  | "component_key"
  | "source"
  | "component_source"
  | "config"
  | "is_active"
  | "is_default"
  | "semver"
  | "version"
  | "updated_at"
>;

const CODE_COLUMNS =
  "id,kind_definition_id,platform,role,component_key,source,component_source,config,is_active,is_default,semver,version,updated_at" as const;

function toRecord(row: KindComponentCodeRow): KindComponentCodeRecord {
  return {
    id: row.id,
    kindDefinitionId: row.kind_definition_id,
    platform: row.platform,
    role: row.role,
    componentKey: row.component_key,
    source: row.source,
    componentSource: row.component_source,
    config: row.config,
    isActive: row.is_active,
    isDefault: row.is_default,
    semver: row.semver,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

/** Load every live component row for one Shape in deterministic resolver order. */
export async function listKindComponentCode(
  client: KindComponentCodeClient,
  kindDefinitionId: string,
): Promise<KindComponentCodeRecord[]> {
  try {
    const rows = await readAllRows<KindComponentCodeRow>(
      ({ from, to }) =>
        client
          .schema("content_ir")
          .from("kind_component")
          .select(CODE_COLUMNS, { count: "exact" })
          .eq("kind_definition_id", kindDefinitionId)
          .is("deleted_at", null)
          .order("is_default", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "content_ir.kind_component for Shape code editor" },
    );
    return rows.map(toRecord);
  } catch (error) {
    throw operationFailed("load this Shape's component code", error);
  }
}

export interface SaveKindComponentCodeArgs {
  component: KindComponentCodeRecord;
  componentSource: string;
}

/** Replace one DB-authored component body without silently overwriting drift. */
export async function saveKindComponentCode(
  client: KindComponentCodeClient,
  args: SaveKindComponentCodeArgs,
): Promise<KindComponentCodeRecord> {
  if (args.component.source !== "db") {
    throw new Error(
      "This component ships in the frontend bundle and cannot be saved as database code.",
    );
  }
  if (!args.componentSource.trim()) {
    throw new Error("Component code cannot be empty.");
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) {
    throw operationFailed("verify who is editing this component", authError);
  }
  if (!authData.user)
    throw new Error("You must be signed in to save component code.");

  try {
    const result = await guardedUpdate<KindComponentCodeRow>({
      expectedVersion: args.component.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        client
          .schema("content_ir")
          .from("kind_component")
          .update({
            component_source: args.componentSource,
            updated_by: authData.user.id,
            version: nextVersion,
          })
          .eq("id", args.component.id)
          .eq("kind_definition_id", args.component.kindDefinitionId)
          .eq("source", "db")
          .eq("version", expectedVersion)
          .is("deleted_at", null)
          .select(CODE_COLUMNS)
          .maybeSingle(),
      fetchCurrent: () =>
        client
          .schema("content_ir")
          .from("kind_component")
          .select(CODE_COLUMNS)
          .eq("id", args.component.id)
          .eq("kind_definition_id", args.component.kindDefinitionId)
          .is("deleted_at", null)
          .maybeSingle(),
    });

    if (result.status === "not_found") {
      throw new Error(
        "This component no longer exists or is no longer editable.",
      );
    }
    if (result.status === "conflict") {
      throw new Error(
        "This component changed while you were editing it. Reload its latest code before saving.",
      );
    }
    return toRecord(result.row);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("This component")) {
      throw error;
    }
    throw operationFailed("save this Shape's component code", error);
  }
}
