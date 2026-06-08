// app/(core)/transcripts/page.tsx
//
// Canonical Transcripts workspace. One feature, one URL — guests get
// the marketing landing server-side; authed users get the processor
// workspace (record / upload / browse / edit transcripts). Studio
// and Scribe live one level down at `/transcripts/studio` and
// `/transcripts/scribe`.
//
// Routes the old `/transcription/processor` URL via the redirect in
// `next.config.js` so existing bookmarks keep working.

import { TranscriptsLayout } from "@/features/transcripts/components/TranscriptsLayout";
import TranscriptsLanding from "@/features/auth/components/module-landing/landings/TranscriptsLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  title: "Transcripts",
  description: "Record, transcribe and manage your audio conversations",
});

export default async function TranscriptsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <TranscriptsLanding />;
  return <TranscriptsLayout />;
}
