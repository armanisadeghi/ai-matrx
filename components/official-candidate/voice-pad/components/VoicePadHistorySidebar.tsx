import { fetchTranscriptsPaginated } from "@/features/transcripts/service/transcriptsService";
import { Transcript } from "@/features/transcripts/types";
import { useRead } from "@ai-matrx/design-system";
import { ReadFailure } from "@/components/read-state/ReadFailure";

export function VoicePadHistorySidebar({
  onClose,
  onSelectTranscript,
}: {
  onClose: () => void;
  onSelectTranscript: (text: string) => void;
}) {
  const read = useRead<Transcript[]>(() => fetchTranscriptsPaginated(20), [], {
    initialData: [],
  });
  const transcripts = read.data ?? [];
  const loading = read.isLoading;

  return (
    <div className="flex flex-col min-h-0 h-full w-full">
      <div className="flex-1 min-h-0 p-1.5 space-y-1">
        {loading ? (
          <div className="text-[10px] text-muted-foreground text-center py-4 animate-pulse">
            Loading...
          </div>
        ) : read.isError && transcripts.length === 0 ? (
          <ReadFailure
            error={read.error}
            what="your recording history"
            onRetry={read.retry}
            className="m-1"
          />
        ) : transcripts.length === 0 ? (
          <div className="text-[10px] text-muted-foreground text-center py-4">
            No history found
          </div>
        ) : (
          transcripts.map((t) => {
            const rawText = t.segments?.map((s) => s.text).join(" ") || "";
            return (
              <button
                key={t.id}
                onClick={() => onSelectTranscript(rawText)}
                type="button"
                className="group w-full text-left p-1.5 rounded-md hover:bg-accent/40 transition-colors block"
                title={rawText}
              >
                <div className="text-[10px] font-medium text-foreground/80 line-clamp-1 leading-tight transition-colors group-hover:text-foreground">
                  {t.title || "Recording"}
                </div>
                <div className="text-[9px] text-muted-foreground/60 line-clamp-2 mt-0.5 leading-tight transition-colors group-hover:text-foreground">
                  {rawText || "No content..."}
                </div>
                <div className="text-[8px] text-muted-foreground/40 mt-1 tabular-nums transition-colors group-hover:text-foreground">
                  {new Date(
                    t.created_at || t.draft_saved_at || "",
                  ).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
