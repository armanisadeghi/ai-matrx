// app/(core)/transcription/processor/page.tsx
import { TranscriptsLayout } from "@/features/transcripts/components/TranscriptsLayout";
import TranscriptsLanding from "@/features/auth/components/module-landing/landings/TranscriptsLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

/**
 * Transcripts Page — Main transcript management interface.
 *
 * Route: /transcription/processor. Guests get the marketing landing
 * server-side; authed users get the live workspace.
 */
export default async function TranscriptsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <TranscriptsLanding />;
  return <TranscriptsLayout />;
}
