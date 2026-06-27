// lib/agent-apps/data.ts
//
// Server-only helpers for fetching agent-app rows from Supabase. Mirrors
// `lib/agents/data.ts`. RLS does the access control; these helpers just
// resolve a row and translate Postgres errors into Next.js notFound().

import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { AgentApp } from "@/features/agent-apps/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SupabaseRowClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single?: () => Promise<{ data: AgentApp | null; error: unknown }>;
        order?: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: AgentAppVersionRow[] | null; error: unknown }>;
      };
    };
  };
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
  const supabase = (await createClient()) as unknown as SupabaseRowClient;
  const column = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const result = await (supabase
    .schema("app")
    .from("definition")
    .select("*")
    .eq(column, idOrSlug)
    .single?.() as Promise<{ data: AgentApp | null; error: unknown }>);

  if (result.error || !result.data) {
    notFound();
  }
  return result.data;
}

/** Fetch all version snapshots for an app, newest first. RLS scopes by app. */
export async function getAgentAppVersions(
  appId: string,
): Promise<AgentAppVersionRow[]> {
  const supabase = (await createClient()) as unknown as SupabaseRowClient;
  const result = await (supabase
    .schema("app")
    .from("definition_version")
    .select(
      "id, app_id, version_number, changed_at, change_note, name, agent_id, agent_version_id, status, pinned_version",
    )
    .eq("app_id", appId)
    .order?.("version_number", { ascending: false }) as Promise<{
    data: AgentAppVersionRow[] | null;
    error: unknown;
  }>);
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

interface SupabaseEqClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c: string,
          v: number,
        ) => {
          single: () => Promise<{
            data: AgentAppVersionDetail | null;
            error: unknown;
          }>;
        };
      };
    };
  };
}

/**
 * Fetch a specific version snapshot. Returns null if the version doesn't
 * exist (caller should call notFound()). RLS scopes through the parent app.
 */
export async function getAgentAppVersion(
  appId: string,
  versionNumber: number,
): Promise<AgentAppVersionDetail | null> {
  const supabase = (await createClient()) as unknown as SupabaseEqClient;
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
