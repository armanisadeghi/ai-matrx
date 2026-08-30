import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveShortLinkPath } from "@ai-matrx/kit/short-link";
import { createClient } from "@/utils/supabase/server";

// The platform short-link resolver (aidream migration 0557). A short token —
// minted server-side, today by the notification spine's render pass so an SMS
// fits one segment — resolves to a same-app path and the visitor is redirected
// there. 🚨 NOT an access door: `resolve_short_link` returns a PATH and never
// content; the target route's own auth/access do all the gating, exactly as if
// the recipient had typed the long URL. The primitive that grants anonymous
// access to content is `/s/[token]` (platform.share_links) — a different
// system, deliberately. Expired and never-existed answer identically and land
// on this segment's not-found (an honest 404), so the route is not an oracle
// for probing tokens.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link · AI Matrx",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ShortLinkPage({ params }: PageProps) {
  const { token: raw } = await params;
  const supabase = await createClient();
  // The whole resolve contract — token normalization, the anon RPC, and the
  // same-app-path re-assertion (the redirect can never leave the app even if
  // a row were tampered with) — is @ai-matrx/kit's resolveShortLinkPath.
  // This file is Next glue only.
  const result = await resolveShortLinkPath(supabase, decodeURIComponent(raw));
  if (!result.ok) {
    if (result.transportError) {
      // A gateway/transport failure is not "this link is gone" — surface the
      // error rather than rendering a lying 404.
      throw new Error(`resolve_short_link failed: ${result.transportError}`);
    }
    notFound();
  }
  redirect(result.targetPath);
}
