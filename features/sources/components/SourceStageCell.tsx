"use client";

/**
 * One Source's Stage cell: the stage of the version people read, the state of
 * reading it, and its remedy in place — "Index stale" → Re-index, a failed
 * status read → Retry (moved from the retired Sources page's table).
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  SOURCE_STAGE_LABEL,
  STAGE_CELL_LABEL,
  stageCellState,
  type SourceFacts,
} from "@/features/sources/sourceRows";

export function SourceStageCell({
  facts,
  read,
  busy,
  onReindex,
  onRetryRead,
}: {
  facts: SourceFacts | undefined;
  read: { loading: boolean; failed: boolean; retrying: boolean };
  busy: boolean;
  onReindex: () => void;
  onRetryRead: () => void;
}) {
  const state = stageCellState(facts, read);
  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };
  if (state === "checking") return <span className="text-xs text-muted-foreground">{STAGE_CELL_LABEL.checking}</span>;
  if (state === "read_failed")
    return (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <span title="This Source's status could not be read from the server. Other rows are unaffected.">
          {STAGE_CELL_LABEL.read_failed}
        </span>
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={(e) => stop(e, onRetryRead)}>
          Retry
        </Button>
      </span>
    );
  if (state !== "stale")
    return (
      <span className={cn("text-xs", state === "not_searchable" && "text-muted-foreground")}>
        {SOURCE_STAGE_LABEL[state]}
        {facts?.entitiesState?.startsWith("failed") ? (
          <span className="ml-1 text-warning" title={facts.entitiesState.slice("failed:".length) || undefined}>
            · entity extraction failed
            <ErrorAlchemyMenu
              error={facts.entitiesState.slice("failed:".length) || "Entity extraction failed"}
              operation="Extract entities"
              size="xs"
            />
          </span>
        ) : null}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-warning">
      <span title="Searches still answer with this Source's previous text; its current version is not indexed yet.">
        Index stale
      </span>
      <Button variant="outline" size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={(e) => stop(e, onReindex)}>
        Re-index
      </Button>
    </span>
  );
}
