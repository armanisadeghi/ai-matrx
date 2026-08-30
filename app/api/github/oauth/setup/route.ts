import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requestBaseUrl } from "../session";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import {
  OrganizationContextError,
  applyOrganizationContextHeader,
  requireOrganizationContext,
} from "@/lib/api/organization-context";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const destination = new URL("/code", requestBaseUrl(request));
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    destination.searchParams.set(
      "github_error",
      "Sign in to update GitHub access.",
    );
    return NextResponse.redirect(destination);
  }
  // Mandatory, fail-closed — mirrors start/route.ts. No known caller of this
  // route passes ?organization_id= today (it has zero references anywhere in
  // this repo, per common-docs/projects/no-db-assigned-org census); fixed
  // anyway rather than leaving a route that would otherwise 400 unhelpfully
  // if it is ever wired up.
  let organizationId: string;
  try {
    organizationId = requireOrganizationContext(
      request.nextUrl.searchParams.get("organization_id"),
    );
  } catch (error) {
    destination.searchParams.set(
      "github_error",
      error instanceof OrganizationContextError
        ? error.message
        : "An organization is required to update GitHub access.",
    );
    return NextResponse.redirect(destination);
  }
  const backendBase = AIDREAM_PRODUCTION_URL;
  const response = await fetch(`${backendBase}/api/github-integrations/sync`, {
    method: "POST",
    headers: applyOrganizationContextHeader(
      {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      organizationId,
    ),
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  destination.searchParams.set(
    response.ok ? "github" : "github_error",
    response.ok ? "updated" : "Unable to update GitHub repository access.",
  );
  return NextResponse.redirect(destination);
}
