// app/(core)/transcripts/page.tsx
//
// Transcripts LIST page — unified hub across every storage dimension:
//   • `transcripts` (Processor records)
//   • `studio_sessions` source≠cleanup (Studio + Scribe sessions)
//   • `studio_sessions` source=cleanup (Cleanup workspaces)
//   • detached `studio_recording_segments` (Scribe unsorted pool)
//
// Each section paginates independently on the client for efficiency.
// Guests: marketing landing. Authed: client hub island.

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { TranscriptsListPage } from "@/features/transcripts/components/TranscriptsListPage";
import TranscriptsLanding from "@/features/auth/components/module-landing/landings/TranscriptsLanding";

export default async function TranscriptsIndexPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <TranscriptsLanding />;

  return <TranscriptsListPage />;
}
