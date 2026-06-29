"use client";

/**
 * CanvasArtifactDebugPanel — admin-only live trace of artifact ↔ canvas binding.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Bug } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import type { CanvasItem } from "@/features/canvas/redux/canvasSlice";
import { cn } from "@/lib/utils";

interface CanvasArtifactDebugPanelProps {
  item: CanvasItem;
  className?: string;
}

export function CanvasArtifactDebugPanel({
  item,
  className,
}: CanvasArtifactDebugPanelProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [expanded, setExpanded] = useState(true);
  const [flashcardSetTitle, setFlashcardSetTitle] = useState<string | null>(
    null,
  );

  const artifactId =
    item.content.metadata?.canvasItemId ?? item.savedItemId ?? null;
  const hasRealId = isMaterializedArtifactId(artifactId);

  const { row, loading, error, refetch } = useCanvasItem(
    hasRealId ? artifactId : null,
  );

  const loadFlashcardSet = useCallback(async () => {
    if (row?.external_system !== "user_flashcard_sets" || !row.external_id) {
      setFlashcardSetTitle(null);
      return;
    }
    try {
      const { flashcardPersistenceService } =
        await import("@/features/flashcards/services/flashcardPersistenceService");
      const { data } = await flashcardPersistenceService.getSet(
        row.external_id,
      );
      setFlashcardSetTitle(data?.title ?? null);
    } catch {
      setFlashcardSetTitle(null);
    }
  }, [row?.external_system, row?.external_id]);

  useEffect(() => {
    void loadFlashcardSet();
  }, [loadFlashcardSet]);

  if (!isAdmin) return null;

  const meta = item.content.metadata;
  const debug = item.artifactDebug;
  const dataShape =
    item.content.data == null
      ? "null"
      : typeof item.content.data === "string"
        ? `string(${item.content.data.length})`
        : typeof item.content.data === "object" &&
            item.content.data !== null &&
            "artifactId" in item.content.data
          ? "pointer{artifactId}"
          : typeof item.content.data;

  return (
    <div
      className={cn(
        "border-b border-amber-500/40 bg-amber-500/5 text-[11px] font-mono",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-amber-800 dark:text-amber-200 hover:bg-amber-500/10"
        onClick={() => setExpanded((e) => !e)}
      >
        <Bug className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold uppercase tracking-wide">
          Artifact debug (admin)
        </span>
        <span className="ml-auto text-muted-foreground">
          {hasRealId ? "UUID ok" : "NO UUID"}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 px-2 pb-2 max-h-48 overflow-y-auto scrollbar-thin">
          <DebugRow label="sessionItemId" value={item.id} />
          <DebugRow
            label="artifactId (canvas_items)"
            value={artifactId ?? "—"}
            highlight={!hasRealId}
          />
          <DebugRow label="isSynced" value={String(item.isSynced ?? false)} />
          <DebugRow label="savedItemId" value={item.savedItemId ?? "—"} />
          <DebugRow label="content.type" value={item.content.type} />
          <DebugRow label="content.data" value={dataShape} />
          <DebugRow label="messageId" value={meta?.messageId ?? "—"} />
          <DebugRow
            label="conversationId"
            value={meta?.conversationId ?? "—"}
          />
          <DebugRow
            label="artifactVersion"
            value={String(meta?.artifactVersion ?? "—")}
          />

          <div className="border-t border-amber-500/20 pt-1">
            <div className="text-amber-700 dark:text-amber-300 font-semibold mb-0.5">
              DB row {loading ? "(loading…)" : error ? `(error: ${error})` : ""}
            </div>
            {row ? (
              <>
                <DebugRow label="db.type" value={row.type} />
                <DebugRow label="db.version" value={String(row.version)} />
                <DebugRow
                  label="db.source_message_id"
                  value={row.source_message_id ?? "—"}
                />
                <DebugRow
                  label="db.artifact_index"
                  value={String(row.artifact_index ?? "—")}
                />
                <DebugRow
                  label="db.external"
                  value={
                    row.external_system
                      ? `${row.external_system} → ${row.external_id}`
                      : "—"
                  }
                />
                {flashcardSetTitle && (
                  <DebugRow label="flashcard set" value={flashcardSetTitle} />
                )}
              </>
            ) : (
              !loading && (
                <p className="text-destructive">
                  {hasRealId
                    ? "UUID set but row not found in DB"
                    : "No artifact UUID — canvas is ephemeral"}
                </p>
              )
            )}
            <button
              type="button"
              className="mt-1 text-primary underline"
              onClick={() => refetch()}
            >
              Refetch DB row
            </button>
          </div>

          {debug && (
            <div className="border-t border-amber-500/20 pt-1">
              <div className="text-amber-700 dark:text-amber-300 font-semibold">
                Last ensure ({debug.wasCreated ? "created" : "existing"}) @{" "}
                {new Date(debug.ensuredAt).toLocaleTimeString()}
              </div>
              <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                {debug.steps.map((s, i) => (
                  <li key={`s-${i}`} className="text-foreground/80">
                    {s}
                  </li>
                ))}
                {debug.errors.map((e, i) => (
                  <li key={`e-${i}`} className="text-destructive">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DebugRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground w-36">{label}</span>
      <span
        className={cn(
          "truncate",
          highlight && "text-destructive font-semibold",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** Compact inline debug strip for chat blocks. */
export function InlineArtifactDebugStrip({
  label,
  artifactId,
  messageId,
  conversationId,
  lastSteps,
  lastErrors,
  busy,
}: {
  label: string;
  artifactId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  lastSteps?: string[];
  lastErrors?: string[];
  busy?: boolean;
}) {
  const isAdmin = useAppSelector(selectIsAdmin);
  if (!isAdmin) return null;

  const hasUuid = isMaterializedArtifactId(artifactId);

  return (
    <div className="mb-1 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] font-mono text-amber-900 dark:text-amber-100">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="font-semibold">{label}</span>
        <span>
          uuid:{" "}
          <span
            className={
              hasUuid
                ? "text-green-700 dark:text-green-400"
                : "text-destructive"
            }
          >
            {artifactId ?? "none"}
          </span>
        </span>
        <span>msg: {messageId ?? "—"}</span>
        <span>conv: {conversationId ?? "—"}</span>
        {busy && <span className="animate-pulse">materializing…</span>}
      </div>
      {lastSteps?.length || lastErrors?.length ? (
        <details className="mt-0.5">
          <summary className="cursor-pointer text-muted-foreground">
            trace
          </summary>
          <ul className="list-disc pl-4 mt-0.5 max-h-24 overflow-y-auto">
            {lastSteps?.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
            {lastErrors?.map((e, i) => (
              <li key={`e-${i}`} className="text-destructive">
                {e}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
