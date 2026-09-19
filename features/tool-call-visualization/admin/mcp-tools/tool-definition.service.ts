"use client";

/**
 * The client-side door onto `tool.definition` writes.
 *
 * Every update goes through `PUT /api/admin/tools/[id]`, which gates on
 * `requireAdmin()` and then writes through the same cookie-backed Supabase
 * client. The database derives human provenance from the verified user's JWT.
 * This module is the single typed wrapper over that route so callers (the detail
 * page's Active toggle, the surface write handlers) share one door instead of
 * each hand-rolling a `fetch`.
 *
 * Throws on any non-2xx, surfacing the API's own `error` string when it sent
 * one. Callers that are surface write handlers rely on that: the writeback
 * seam turns a throw into the error envelope the agent reads.
 */

import type { Database } from "@/types/database.types";

type ToolRow = Database["tool"]["Tables"]["definition"]["Row"];

/**
 * The columns this wrapper is willing to send. Deliberately narrower than
 * `Update`: identity (`id`, `name`), the machine contract (`parameters`,
 * `output_schema`, `annotations`), gating and tiering all have their own
 * editors and are not reachable through here.
 */
export type ToolDefinitionPatch = {
  description?: string;
  category?: string | null;
  tags?: string[] | null;
  is_active?: boolean;
};

export async function toolApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  const serverMessage = [body?.error, body?.details]
    .filter((value): value is string => Boolean(value))
    .join(": ");
  return serverMessage || `${fallback} (HTTP ${response.status}).`;
}

export async function updateToolDefinition(
  toolId: string,
  patch: ToolDefinitionPatch,
): Promise<ToolRow> {
  const response = await fetch(`/api/admin/tools/${toolId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(await toolApiErrorMessage(response, "Failed to update tool"));
  }

  const body = (await response.json()) as { tool: ToolRow };
  return body.tool;
}
