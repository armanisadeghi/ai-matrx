// lib/applets/data.ts
//
// Server-only helpers for fetching applet rows from Supabase. Mirrors
// `lib/agents/data.ts`. RLS does the access control; these helpers just
// resolve a row and translate Postgres errors into Next.js notFound().

import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import * as z from "zod";
import { createClient } from "@/utils/supabase/server";
import type { Database, Json } from "@/types/database.types";
import type {
  AppletRow,
  AppletDefinition,
  AppStatus,
} from "@/features/applets/types";
import { isUuidShape } from "@ai-matrx/kit/uuid";

// The generated Row types `status` as plain text; `AppletDefinition` narrows it.
// Validated at read time — a stray DB value fails loudly, never a silent default.

type AppDefinitionRow = Database["app"]["Tables"]["definition"]["Row"];

const APP_STATUSES = [
  "draft",
  "published",
  "archived",
  "suspended",
] as const satisfies readonly AppStatus[];

const narrowedColumnsSchema = z.object({
  status: z.enum(APP_STATUSES),
  tags: z
    .array(z.string())
    .nullable()
    .transform((t) => t ?? []),
});

function parseAppletRow(row: AppDefinitionRow): AppletDefinition {
  const parsed = narrowedColumnsSchema.safeParse(row);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `[getApplet] app.definition row ${row.id} failed domain validation: ${detail}`,
    );
  }
  return { ...row, ...parsed.data };
}

export interface AppletVersionRow {
  id: string;
  app_id: string;
  version_number: number;
  changed_at: string;
  change_note: string | null;
  name: string | null;
  status: string | null;
  files: Json;
  entry: string | null;
  pages: Json;
  mandates: Json;
  sources: Json;
}

/**
 * Fetch by id-or-slug; calls notFound() if RLS hides it or no row exists. Once per request (React
 * `cache`): the manage layout, its metadata and the page all ask for the same row.
 */
export const getApplet = cache(async function getApplet(idOrSlug: string): Promise<AppletRow> {
  const supabase = await createClient();
  const column = isUuidShape(idOrSlug) ? "id" : "slug";
  const result = await supabase
    .schema("app")
    .from("definition")
    .select("*")
    .is("deleted_at", null)
    .eq(column, idOrSlug)
    .single();

  if (result.error || !result.data) {
    notFound();
  }
  return parseAppletRow(result.data);
});

/** Fetch all version snapshots for an app, newest first. RLS scopes by app. */
export async function getAppletVersions(
  appId: string,
): Promise<AppletVersionRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .schema("app")
    .from("definition_version")
    .select(
      "id, app_id, version_number, changed_at, change_note, name, status, files, entry, pages, mandates, sources",
    )
    .eq("app_id", appId)
    .is("deleted_at", null)
    .order("version_number", { ascending: false });
  if (result.error) return [];
  return result.data ?? [];
}

export interface AppletVersionDetail extends AppletVersionRow {
  tagline: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  parent_applet_id: string | null;
}

/**
 * Fetch a specific version snapshot. Returns null if the version doesn't
 * exist (caller should call notFound()). RLS scopes through the parent app.
 */
export async function getAppletVersion(
  appId: string,
  versionNumber: number,
): Promise<AppletVersionDetail | null> {
  const supabase = await createClient();
  const result = await supabase
    .schema("app")
    .from("definition_version")
    .select(
      "id, app_id, version_number, changed_at, change_note, name, tagline, description, category, tags, status, files, entry, pages, mandates, sources, parent_applet_id",
    )
    .eq("app_id", appId)
    .eq("version_number", versionNumber)
    .is("deleted_at", null)
    .single();
  if (result.error || !result.data) return null;
  return result.data;
}
