import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

/**
 * Resolves `scope` + `scopeId` from a JSON request body into the four row-level
 * scope foreign keys (`created_by`, `organization_id`, `project_id`, `task_id`)
 * used across the agent-shortcuts / shortcut-categories tables. (Content
 * blocks moved to skill.render_definition, written directly via supabase-js.)
 *
 * 🚨 THE REQUEST CONTEXT IS CARRIED, NEVER REBUILT
 * (common-docs/policies/context-is-carried-never-rebuilt.md).
 *
 * `organization_id` is NOT NULL on all three tables AND
 * `public._stamp_org_default` is a BEFORE INSERT trigger on 328 tables that
 * files a NULL organization into the WRITER'S PERSONAL organization — so a
 * missing organization here is not an error, it is a silent misfile. This
 * helper therefore never invents, defaults, or substitutes one:
 *
 *  - the organization a write acts in is the one the person SELECTED, admitted
 *    at the boundary on `X-Organization-Id` (the header every Matrx client
 *    carries). It is read here, never resolved;
 *  - a `organization_id` on the BODY never wins: it may only agree with the
 *    admitted header, and a disagreement is a 409 — the body is a claim, the
 *    header is the admitted context;
 *  - the platform-global tier (the system org, which is `global_readable` and
 *    therefore visible to every tenant on the platform) is an EXPLICIT,
 *    ADMIN-GATED request: `scope: "global"` from a super admin. It used to be
 *    what an absent scope silently fell through to, which published any
 *    signed-in caller's row platform-wide;
 *  - an absent scope is a 400 naming the field — never a tier.
 *
 * Returns either a mutated `payload` with the correct FKs set, or a
 * `NextResponse` carrying an honest refusal (400 / 403 / 409).
 */
export async function applyScopeToInsertPayload(args: {
  request: NextRequest;
  body: Record<string, unknown>;
  payload: Record<string, unknown>;
  userId: string;
  client: SupabaseClient;
}): Promise<NextResponse | Record<string, unknown>> {
  const { request, body, payload, userId, client } = args;
  const scope = typeof body.scope === "string" ? body.scope : null;
  const scopeId =
    typeof body.scopeId === "string" && body.scopeId.length > 0
      ? body.scopeId
      : null;
  const bodyOrganizationId =
    typeof body.organization_id === "string" &&
    body.organization_id.trim().length > 0
      ? body.organization_id.trim()
      : null;
  const headerOrganizationId =
    request.headers.get("X-Organization-Id")?.trim() || null;

  // Always normalize so clients cannot inject a scope FK out of band.
  payload.created_by = null;
  payload.organization_id = null;
  payload.project_id = null;
  payload.task_id = null;

  /** The admitted organization, or an honest refusal naming what is missing. */
  function admittedOrganization(): string | NextResponse {
    if (!headerOrganizationId) {
      return NextResponse.json(
        {
          error:
            "No organization was named for this request. Choose the organization you are working in and try again.",
          code: "organization_context_required",
        },
        { status: 400 },
      );
    }
    if (bodyOrganizationId && bodyOrganizationId !== headerOrganizationId) {
      return NextResponse.json(
        {
          error:
            "This request asks to file the row in a different organization than the one it is acting in. Switch organizations and try again.",
          code: "organization_context_conflict",
        },
        { status: 409 },
      );
    }
    return headerOrganizationId;
  }

  if (scope === null) {
    return NextResponse.json(
      {
        error:
          'This request did not say who the row is for. Send "scope" as one of: global, user, organization, project, task.',
        code: "scope_required",
      },
      { status: 400 },
    );
  }

  if (scope === "global") {
    // The global tier publishes into the system org, which is
    // `global_readable` — every tenant on the platform can read it. That is a
    // platform act, so it is deliberate AND admin-gated; the repo's one gate
    // is `checkIsSuperAdmin` (no new gate primitive here).
    const isSuperAdmin = await checkIsSuperAdmin(client, userId);
    if (!isSuperAdmin) {
      return NextResponse.json(
        {
          error:
            "Only a platform administrator can publish this to every organization. Choose an organization for it instead.",
          code: "global_scope_forbidden",
        },
        { status: 403 },
      );
    }
    payload.organization_id = await resolveSystemOrgId(client);
    return payload;
  }

  if (scope === "user") {
    const organizationId = admittedOrganization();
    if (organizationId instanceof NextResponse) return organizationId;
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
    const organizationId = admittedOrganization();
    if (organizationId instanceof NextResponse) return organizationId;

    if (scope === "organization") {
      // The named organization IS the tenant, so it must be the one the
      // request was admitted in — otherwise the caller is writing into an
      // organization they did not select.
      if (scopeId !== organizationId) {
        return NextResponse.json(
          {
            error:
              "This request asks to file the row in a different organization than the one it is acting in. Switch organizations and try again.",
            code: "organization_context_conflict",
          },
          { status: 409 },
        );
      }
    } else if (scope === "project") {
      payload.project_id = scopeId;
    } else {
      payload.task_id = scopeId;
    }
    payload.organization_id = organizationId;
    return payload;
  }

  return NextResponse.json(
    { error: `Unknown scope: ${scope}` },
    { status: 400 },
  );
}
