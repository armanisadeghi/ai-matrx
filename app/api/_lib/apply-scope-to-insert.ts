import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";

/**
 * Resolves `scope` + `scopeId` from a JSON request body into the four row-level
 * scope foreign keys (`created_by`, `organization_id`, `project_id`, `task_id`)
 * used across the agent-shortcuts / shortcut-categories tables. (Content
 * blocks moved to skill.render_definition, written directly via supabase-js.)
 *
 * The authenticated `userId` is used for `scope === "user"` so the client never
 * needs to send it (and can't spoof it). For scoped inserts (organization /
 * project / task), `scopeId` on the body must be a non-empty string.
 *
 * `organization_id` is **NOT NULL** on all three tables, so it is ALWAYS
 * resolved to a real org — never left null:
 *  - global  → the system org (global/platform content)
 *  - user    → the organization explicitly carried by the client operation
 *  - org     → the given org scopeId
 *  - project/task → the organization explicitly carried by the client
 *
 * Returns either a mutated `payload` with the correct FKs set, or a
 * `NextResponse` with a 400 if the scope is malformed.
 */
export async function applyScopeToInsertPayload(args: {
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
  userId: string;
  client: SupabaseClient;
}): Promise<NextResponse | Record<string, unknown>> {
  const { body, payload, userId, client } = args;
  const scope = typeof body.scope === "string" ? body.scope : null;
  const scopeId =
    typeof body.scopeId === "string" && body.scopeId.length > 0
      ? body.scopeId
      : null;
  const organizationId =
    typeof body.organization_id === "string" &&
    body.organization_id.trim().length > 0
      ? body.organization_id.trim()
      : null;

  // Always normalize so clients cannot inject a scope FK out of band.
  payload.created_by = null;
  payload.organization_id = null;
  payload.project_id = null;
  payload.task_id = null;

  if (scope === null || scope === "global") {
    payload.organization_id = await resolveSystemOrgId(client);
    return payload;
  }

  if (scope === "user") {
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id is required when scope=user" },
        { status: 400 },
      );
    }
    payload.created_by = userId;
    payload.organization_id = organizationId;
    return payload;
  }

  if (scope === "organization" || scope === "project" || scope === "task") {
    if (!scopeId) {
      return NextResponse.json(
        { error: `scopeId is required when scope=${scope}` },
        { status: 400 },
      );
    }
    if (scope === "organization") {
      if (organizationId && organizationId !== scopeId) {
        return NextResponse.json(
          {
            error: "organization_id must match scopeId when scope=organization",
          },
          { status: 400 },
        );
      }
      payload.organization_id = scopeId;
    } else {
      if (!organizationId) {
        return NextResponse.json(
          { error: `organization_id is required when scope=${scope}` },
          { status: 400 },
        );
      }
      if (scope === "project") payload.project_id = scopeId;
      else payload.task_id = scopeId;
      payload.organization_id = organizationId;
    }
    return payload;
  }

  return NextResponse.json(
    { error: `Unknown scope: ${scope}` },
    { status: 400 },
  );
}
