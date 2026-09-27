// app/(core)/transcripts/page.tsx
//
// The retired Transcripts LIST (KNOWLEDGE-HUB §6, H6d; HUB-PARITY-CHECKLISTS
// "Transcripts — retired"). Finding transcripts, studio sessions, cleanup
// sessions and transcript Sources is the Knowledge hub's Transcripts view now —
// the per-kind row menu, inline rename, Export, Copy / Copy for AI, and the
// Type / Status / Folders / Visibility / Tags / Scope facets — so this address
// lands there with its search, scope, sort and filters kept. Every processing
// page (/transcripts/processor, /studio, /cleanup, /scribe, /new) stays its
// record page. Guests still see the product's landing.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { transcriptsToHubHref } from "@/features/knowledge/hub/legacyRoutes";
import TranscriptsLanding from "@/features/auth/components/module-landing/landings/TranscriptsLanding";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RetiredTranscriptsListPage({ searchParams }: PageProps) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <TranscriptsLanding />;
  redirect(transcriptsToHubHref(await searchParams));
}
