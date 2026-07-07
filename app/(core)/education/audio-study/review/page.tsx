import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AudioReviewSession } from "@/features/education/media/audio/components/AudioReviewSession";

export const metadata: Metadata = toolMetadata("audio-study");

// Audio review — spoken quiz over a deck, graded on meaning, recorded to the
// study spine (method 'audio_review'). Your library — requires sign-in.
export default async function AudioReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string }>;
}) {
  const { deck } = await searchParams;
  return <AudioReviewSession initialDeckId={deck} />;
}
