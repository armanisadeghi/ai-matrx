import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requestBaseUrl } from "../session";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";

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
  const backendBase = AIDREAM_PRODUCTION_URL;
  const response = await fetch(`${backendBase}/api/github-integrations/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  destination.searchParams.set(
    response.ok ? "github" : "github_error",
    response.ok ? "updated" : "Unable to update GitHub repository access.",
  );
  return NextResponse.redirect(destination);
}
