import { TranscriptRecordPage } from "@/features/knowledge/hub/embeds/TranscriptRecordPage";

/**
 * /knowledge/transcripts/<transcript_id> — a transcript's own page in the
 * Knowledge area: its text and its recording's player (the Source screen when
 * it became a Source, else the transcript viewer). The Knowledge hub's Open
 * lands here.
 */
export const dynamic = "force-dynamic";

export default async function KnowledgeTranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TranscriptRecordPage key={id} transcriptId={id} />;
}
