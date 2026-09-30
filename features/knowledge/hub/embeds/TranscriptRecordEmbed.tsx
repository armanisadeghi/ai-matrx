"use client";

/**
 * A transcript record in the Knowledge area — the text and, when it has one,
 * its recording's player. A transcript that became a Source opens on the
 * Source screen (its timed text and media players); one that never did opens
 * the transcript viewer the transcripts module uses (read the one record by
 * id — RLS decides — and show it). Used by the hub's peek and by
 * /knowledge/transcripts/<id>.
 */

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Skeleton } from "@ai-matrx/design-system";
import { supabase } from "@/utils/supabase/client";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { TranscriptViewer } from "@/features/transcripts/components/TranscriptViewer";
import { fetchTranscriptById } from "@/features/transcripts/service/transcriptsService";
import { setActiveTranscript } from "@/features/transcripts/redux/thunks";
import { SourceEmbed } from "./SourceEmbed";

type State =
  | { status: "loading" }
  | { status: "source"; sourceId: string }
  | { status: "viewer" }
  | { status: "missing" }
  | { status: "error"; error: string };

export function TranscriptRecordEmbed({ transcriptId }: { transcriptId: string }) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const { data, error } = await supabase
        .schema("transcripts")
        .from("transcripts")
        .select("id, processed_document_id")
        .eq("id", transcriptId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (error) return setState({ status: "error", error: error.message });
      if (!data) return setState({ status: "missing" });
      const pd = (data as { processed_document_id: string | null }).processed_document_id;
      if (pd) return setState({ status: "source", sourceId: pd });
      try {
        const t = await fetchTranscriptById(transcriptId);
        if (cancelled) return;
        if (!t) return setState({ status: "missing" });
        dispatch(setActiveTranscript(t) as never);
        setState({ status: "viewer" });
      } catch (err) {
        if (!cancelled) setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, transcriptId, nonce]);

  if (state.status === "loading")
    return (
      <div className="space-y-3 p-4" role="status" aria-label="Opening the transcript">
        <Skeleton className="h-9 w-full rounded-md" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className={i % 2 ? "h-3.5 w-5/6" : "h-3.5 w-full"} />
        ))}
      </div>
    );
  if (state.status === "error")
    return <ReadFailure error={state.error} what="this transcript" onRetry={() => setNonce((n) => n + 1)} className="m-4" />;
  if (state.status === "missing")
    return <p className="p-4 text-sm text-muted-foreground">This transcript is in Trash or not shared with you.</p>;
  if (state.status === "source")
    return <SourceEmbed sourceId={state.sourceId} deepLink={{ page: null, chunkId: null, assets: false, ms: null }} />;
  return (
    <div className="h-full min-h-0 overflow-y-auto" data-testid="hub-embed-transcript-record">
      <TranscriptViewer />
    </div>
  );
}
