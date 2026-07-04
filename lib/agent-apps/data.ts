// lib/agent-apps/data.ts
//
// Server-only helpers for fetching agent-app rows from Supabase. Mirrors
// `lib/agents/data.ts`. RLS does the access control; these helpers just
// resolve a row and translate Postgres errors into Next.js notFound().

import "server-only";
import { notFound } from "next/navigation";
import * as z from "zod";
import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";
import type {
  AgentApp,
  AgentAppRecord,
  AgentAppShellKind,
  AppStatus,
  ComponentLanguage,
} from "@/features/agent-apps/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Runtime validation of the `app.definition` row.
//
// The generated Row (`Database["app"]["Tables"]["definition"]["Row"]`) types
// several domain columns as plain `string` because Postgres stores them as
// text. `AgentAppRecord` (features/agent-apps/types.ts) narrows exactly three
// of them to literal unions — `component_language` (ComponentLanguage),
// `shell_kind` (AgentAppShellKind), and `status` (AppStatus). That narrowing
// is a LIE unless something checks it at read time: a stray DB value would
// flow in typed-but-wrong. We validate those three fields with Zod here and
// throw loudly on any out-of-domain value rather than casting or silently
// defaulting. (`app_kind` is left as `string` in AgentAppRecord — it has no
// closed domain to validate against — so it is not enumerated here.)
//
// Every other column is trusted as generated: Supabase's types are the source
// of truth for the shapes Postgres actually returns, and the Json-typed
// columns keep their `Json` interiors un-narrowed per the type-safety doctrine.

type AppDefinitionRow = Database["app"]["Tables"]["definition"]["Row"];

/**
 * `Assert<T>` compiles only when `T` is exactly `true`; feeding it `false`
 * violates the `extends true` constraint and is a hard compile error. This is
 * the mechanism that turns the drift checks below into build breaks.
 */
type Assert<T extends true> = T;
/** True iff every member of `TUnion` appears in the tuple `TTuple`. */
type TupleCoversUnion<
  TUnion extends string,
  TTuple extends readonly string[],
> = [TUnion] extends [TTuple[number]] ? true : false;

const COMPONENT_LANGUAGES = [
  "tsx",
  "jsx",
  "typescript",
  "javascript",
  "html",
  "react",
] as const satisfies readonly ComponentLanguage[];

const SHELL_KINDS = [
  "chat",
  "form_to_result",
  "widget",
  "compact_modal",
  "full_modal",
  "sidebar_overlay",
  "floating_bubble",
  "inline_overlay",
  "panel_overlay",
  "toast_overlay",
  "card_stack",
  "fully_custom",
] as const satisfies readonly AgentAppShellKind[];

const APP_STATUSES = [
  "draft",
  "published",
  "archived",
  "suspended",
] as const satisfies readonly AppStatus[];

// Bidirectional closure check: the `satisfies` above proves every tuple member
// is a valid union member (no extras); these `Assert`s prove every union member
// is in the tuple (no omissions). Together they force EXACT equality — add or
// remove a value on either the TS union or the tuple without matching the other
// and this file fails to compile, so the Zod enums can never silently disagree
// with `AgentAppRecord`. (Unused type aliases don't trip noUnusedLocals — that
// rule targets values — so these stay purely as compile-time guards.)
type _AssertComponentLanguages = Assert<
  TupleCoversUnion<ComponentLanguage, typeof COMPONENT_LANGUAGES>
>;
type _AssertShellKinds = Assert<
  TupleCoversUnion<AgentAppShellKind, typeof SHELL_KINDS>
>;
type _AssertAppStatuses = Assert<
  TupleCoversUnion<AppStatus, typeof APP_STATUSES>
>;

/**
 * Validates the three narrowed domain columns of an `app.definition` row and
 * normalizes `tags` (DB `string[] | null` → `string[]`). Everything else is
 * carried through from the already-typed row. `.parse()` throws a
 * `ZodError` naming the offending field + value on any out-of-domain value —
 * a loud failure, never a silent default.
 */
const narrowedColumnsSchema = z.object({
  component_language: z.enum(COMPONENT_LANGUAGES),
  shell_kind: z.enum(SHELL_KINDS),
  status: z.enum(APP_STATUSES),
  tags: z
    .array(z.string())
    .nullable()
    .transform((t) => t ?? []),
});

/**
 * Parse a raw `app.definition` row into a fully-typed `AgentAppRecord` with no
 * `as unknown as` and no `any`. Throws loudly (with the app id in context) if
 * a domain column holds a value outside its literal union.
 */
function parseAgentAppRow(row: AppDefinitionRow): AgentAppRecord {
  const parsed = narrowedColumnsSchema.safeParse(row);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `[getAgentApp] app.definition row ${row.id} failed domain validation ` +
        `(component_language/shell_kind/status). This is a data-integrity ` +
        `defect — the DB holds a value outside the app's known domain: ${detail}`,
    );
  }
  // The generated Row supplies every non-narrowed field with its correct type;
  // `parsed.data` supplies the three validated literal-union fields + non-null
  // tags. Merging yields an AgentAppRecord with zero assertions.
  return { ...row, ...parsed.data };
}

export interface AgentAppVersionRow {
  id: string;
  app_id: string;
  version_number: number;
  changed_at: string;
  change_note: string | null;
  name: string | null;
  agent_id: string | null;
  agent_version_id: string | null;
  status: string | null;
  pinned_version: number | null;
}

/** Fetch by id-or-slug; calls notFound() if RLS hides it or no row exists. */
export async function getAgentApp(idOrSlug: string): Promise<AgentApp> {
  const supabase = await createClient();
  const column = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const result = await supabase
    .schema("app")
    .from("definition")
    .select("*")
    .eq(column, idOrSlug)
    .single();

  if (result.error || !result.data) {
    notFound();
  }
  // `definition`'s generated Row types several domain columns as plain
  // `string`; `AgentAppRecord` narrows them to literal unions. `parseAgentAppRow`
  // validates those literals at read time (throwing loudly on a bad DB value)
  // so we hand back a genuinely-typed record with no `as unknown as`.
  return parseAgentAppRow(result.data);
}

/** Fetch all version snapshots for an app, newest first. RLS scopes by app. */
export async function getAgentAppVersions(
  appId: string,
): Promise<AgentAppVersionRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .schema("app")
    .from("definition_version")
    .select(
      "id, app_id, version_number, changed_at, change_note, name, agent_id, agent_version_id, status, pinned_version",
    )
    .eq("app_id", appId)
    .order("version_number", { ascending: false });
  if (result.error) return [];
  return result.data ?? [];
}

export interface AgentAppVersionDetail {
  id: string;
  app_id: string;
  version_number: number;
  changed_at: string;
  change_note: string | null;
  name: string | null;
  tagline: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  status: string | null;
  agent_id: string | null;
  agent_version_id: string | null;
  pinned_version: number | null;
  component_code: string | null;
  component_language: string | null;
  layout_config: unknown;
  styling_config: unknown;
  variable_schema: unknown;
}

/**
 * Fetch a specific version snapshot. Returns null if the version doesn't
 * exist (caller should call notFound()). RLS scopes through the parent app.
 */
export async function getAgentAppVersion(
  appId: string,
  versionNumber: number,
): Promise<AgentAppVersionDetail | null> {
  const supabase = await createClient();
  const result = await supabase
    .schema("app")
    .from("definition_version")
    .select(
      "id, app_id, version_number, changed_at, change_note, name, tagline, description, category, tags, status, agent_id, agent_version_id, pinned_version, component_code, component_language, layout_config, styling_config, variable_schema",
    )
    .eq("app_id", appId)
    .eq("version_number", versionNumber)
    .single();
  if (result.error || !result.data) return null;
  return result.data;
}
