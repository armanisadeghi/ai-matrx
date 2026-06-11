// app/(core)/transcripts/processor/page.tsx
//
// The processor workspace — the original transcripts UI. No longer the
// forced entry: the new list-savior page at `/transcripts` is the entry,
// and this page is reached by clicking "Open" on a list row (or by
// landing on the legacy `/transcription/processor` URL via the
// `next.config.js` 308 redirect chain).
//
// Auth gate is the parent layout group's default (no special guarding
// here — guests get the marketing landing at `/transcripts`).

import { TranscriptsLayout } from "@/features/transcripts/components/TranscriptsLayout";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { redirect } from "next/navigation";
export default async function TranscriptsProcessorPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    // Guests bounce to the public `/transcripts` landing (the savior page
    // already gates them with the marketing landing).
    redirect("/transcripts");
  }
  return <TranscriptsLayout />;
}
