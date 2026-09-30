// app/(core)/compare/old/transcripts/page.tsx
//
// The OLD Transcripts list, kept only for comparison (Arman, 2026-09-29): the
// live page is the Knowledge hub's Transcripts view (`/transcripts` redirects
// there). This review-only address renders the old list component unchanged —
// with its "Old page, kept for comparison" banner and a link to the new view —
// until Arman confirms the new view, then this route and the old list code are
// deleted (HUB-PARITY-CHECKLISTS "Transcripts").

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { TranscriptsListPage } from "@/features/transcripts/components/TranscriptsListPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  title: "Transcripts (old page)",
  description: "The old Transcripts list, kept for comparison with the new Transcripts view.",
  letter: "TR",
});

export default async function OldTranscriptsListPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/transcripts");
  return <TranscriptsListPage />;
}
