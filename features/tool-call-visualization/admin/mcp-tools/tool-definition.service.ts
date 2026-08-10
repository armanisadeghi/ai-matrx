"use client";

/**
 * The client-side door onto `tool.definition` writes.
 *
 * `tool.definition` has RLS with a SELECT-only policy and NO write policy, so
 * a browser client CANNOT write it directly — every update has to go through
 * `PUT /api/admin/tools/[id]`, which gates on `requireAdmin()` and then writes
 * with the service-role admin client. That route is the canonical write path;
 * this module is the single typed wrapper over it so callers (the detail
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
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ?? `Failed to update tool (HTTP ${response.status}).`,
    );
  }

  const body = (await response.json()) as { tool: ToolRow };
  return body.tool;
}
