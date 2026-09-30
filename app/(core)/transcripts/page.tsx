// app/(core)/transcripts/page.tsx
//
// The Transcripts LIST lives in the Knowledge hub now (KNOWLEDGE-HUB §6, H6d):
// `/knowledge?view=transcripts` reads the list's own server functions
// (trx_list_scoped / trx_list_facets / trx_list_scope_counts), so every row
// kind — transcripts, recording sessions, cleanups, unsorted recordings — and
// every filter, scope and search is there, plus the list's row menu, rename,
// Export and Copy. This address lands there with its search, scope, sort and
// filters kept. The old list stays reviewable at /compare/old/transcripts
// until Arman confirms (2026-09-29). Every processing page (processor,
// studio, cleanup, scribe, new) stays its record page. Guests see the landing.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { transcriptsToHubHref } from "@/features/knowledge/hub/legacyRoutes";
import TranscriptsLanding from "@/features/auth/components/module-landing/landings/TranscriptsLanding";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TranscriptsIndexPage({ searchParams }: PageProps) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <TranscriptsLanding />;
  redirect(transcriptsToHubHref(await searchParams));
}
