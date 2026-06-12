import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TranscriptsHubCard } from "@/features/transcripts/components/TranscriptsHubCard";
import type { TranscriptHubItem } from "@/features/transcripts/types/hub";

interface TranscriptsHubSectionProps {
  title: string;
  items: TranscriptHubItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  emptyMessage: string;
}

export function TranscriptsHubSection({
  title,
  items,
  loading,
  error,
  hasMore,
  onLoadMore,
  emptyMessage,
}: TranscriptsHubSectionProps) {
  const showEmpty = !loading && !error && items.length === 0;

  return (
    <section className="mb-8">
      <h2 className="mb-3 px-1 text-sm font-semibold text-foreground">
        {title}
      </h2>

      {error ? <p className="px-1 text-xs text-destructive">{error}</p> : null}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {showEmpty ? (
        <p className="px-1 text-xs text-muted-foreground">{emptyMessage}</p>
      ) : null}

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <TranscriptsHubCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      ) : null}

      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loading}
            className="h-8 text-xs"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              "Show more"
            )}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
