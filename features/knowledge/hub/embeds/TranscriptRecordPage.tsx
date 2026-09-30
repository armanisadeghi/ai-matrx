"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TranscriptRecordEmbed } from "./TranscriptRecordEmbed";

/** The page frame: a back door to the Transcripts view, then the transcript. */
export function TranscriptRecordPage({ transcriptId }: { transcriptId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RouteHeader
        left={
          <Link
            href="/knowledge/hub?view=transcripts"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Transcripts
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden pt-[var(--shell-header-h)]">
        <TranscriptRecordEmbed transcriptId={transcriptId} />
      </div>
    </div>
  );
}
