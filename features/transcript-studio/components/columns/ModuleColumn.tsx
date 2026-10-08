"use client";

import { useEffect, useMemo, useRef } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { RichDocumentActions } from "@ai-matrx/rich-content/rich-document/RichDocumentActions";
import { COLUMN_IDS } from "../../constants";
import {
  selectLatestRunForColumn,
  selectSessionReadError,
} from "../../redux/selectors";
import { runModulePassThunk } from "../../redux/runModulePass.thunk";
import {
  deleteModuleSegmentThunk,
  updateModuleSegmentPayloadThunk,
  fetchModuleSegmentsThunk,
} from "../../redux/thunks";
import type { ModuleSegment } from "../../types";
import { getModule } from "../../modules/registry";
import { useStudioSettings } from "../../hooks/useStudioSettings";
import { useScrollSync } from "../scroll-sync/ScrollSyncProvider";
import { ColumnEmptyState } from "./ColumnEmptyState";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { ColumnHeader } from "./ColumnHeader";
import { WatchRunButton } from "./WatchRunButton";
import { EditableTextSegmentRow } from "./EditableTextSegmentRow";
import { SegmentWrapper } from "./SegmentWrapper";

interface ModuleColumnProps {
  sessionId: string;
  className?: string;
}

export function ModuleColumn({ sessionId, className }: ModuleColumnProps) {
  // Active module id lives on the session row. Default is "tasks".
  const moduleId = useAppSelector(
    (state) => state.transcriptStudio.byId[sessionId]?.moduleId ?? "tasks",
  );
  // Phase 8: per-session settings drive the "show prior modules" toggle.
  const { effective: settings } = useStudioSettings(sessionId);
  const showPriorModules = settings.showPriorModules;

  const ids = useAppSelector(
    (state) => state.transcriptStudio.moduleSegmentIdsBySession[sessionId],
  );
  const byId = useAppSelector(
    (state) => state.transcriptStudio.moduleSegmentsById[sessionId],
  );
  const segments = useMemo<ModuleSegment[]>(() => {
    if (!ids || !byId) return [];
    const out: ModuleSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (!seg) continue;
      // Filter to the active module unless the session has chosen to show
      // prior module history.
      if (!showPriorModules && seg.moduleId !== moduleId) continue;
      out.push(seg);
    }
    return out;
  }, [ids, byId, moduleId, showPriorModules]);

  const moduleDef = useMemo(() => getModule(moduleId), [moduleId]);

  // Run audit, used for the dot + status string.
  const latestRun = useAppSelector(selectLatestRunForColumn(sessionId, 4));

  const isRunning = latestRun?.status === "running";
  const dotState = isRunning
    ? "running"
    : latestRun?.status === "failed"
      ? "error"
      : "idle";
  const status = useMemo(() => {
    const labelPrefix = moduleDef?.label ?? moduleId;
    if (segments.length === 0) {
      return isRunning ? `${labelPrefix} · running…` : labelPrefix;
    }
    return `${labelPrefix} · ${segments.length} pass${segments.length === 1 ? "" : "es"}${isRunning ? " · running" : ""}`;
  }, [segments, isRunning, moduleDef, moduleId]);

  // Sync-scroll registration.
  const sync = useScrollSync();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    sync.registerColumn(COLUMN_IDS.module, scrollRef.current);
    return () => sync.registerColumn(COLUMN_IDS.module, null);
  }, [sync]);
  const onPointerLead = () => sync.markLeader(COLUMN_IDS.module);

  const dispatch = useAppDispatch();
  const readError = useAppSelector(selectSessionReadError(sessionId, "module"));
  const retryRead = () => void dispatch(fetchModuleSegmentsThunk({ sessionId }));
  const handleManualRun = () => {
    if (isRunning) return;
    void dispatch(runModulePassThunk({ sessionId, triggerCause: "manual" }));
  };
  const manualButton = (
    <button
      type="button"
      onClick={handleManualRun}
      disabled={isRunning}
      title={
        isRunning
          ? "A module pass is already running"
          : `Run ${moduleDef?.label ?? moduleId} now`
      }
      aria-label="Run module now"
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
        isRunning
          ? "text-muted-foreground/50 cursor-not-allowed"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <RefreshCw className="h-3 w-3" />
    </button>
  );

  const sessionTitle = useAppSelector(
    (state) => state.transcriptStudio.byId[sessionId]?.title,
  );

  const exportMarkdown = useMemo(() => {
    if (segments.length === 0) return "";
    return segments
      .map((seg) => {
        return typeof seg.payload === "string"
          ? seg.payload
          : JSON.stringify(seg.payload, null, 2);
      })
      .join("\n\n---\n\n");
  }, [segments]);

  const headerActions = (
    <>
      {manualButton}
      <WatchRunButton
        sessionId={sessionId}
        columnIdx={4}
        label={`Building ${(moduleDef?.label ?? moduleId).toLowerCase()}`}
      />
      {segments.length > 0 && (
        <RichDocumentActions
          content={exportMarkdown}
          source={{
            type: "raw",
            title: sessionTitle
              ? `${moduleDef?.label ?? "Module"} — ${sessionTitle}`
              : (moduleDef?.label ?? "Module Output"),
          }}
          actions={{
            metadata: {
              source: "transcript-studio",
              column: "module",
              session_id: sessionId,
              session_title: sessionTitle,
              module_id: moduleId,
              passes: segments.length,
            },
            exclude: ["open-fullscreen-editor", "tts-play"],
          }}
        />
      )}
    </>
  );

  const HeaderIcon = moduleDef?.icon ?? ListChecks;

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
      aria-label="Module"
    >
      <ColumnHeader
        icon={HeaderIcon}
        label="Module"
        status={status}
        dotState={dotState}
        actions={headerActions}
      />
      {readError && segments.length > 0 ? (
        <StaleDataNotice
          hasData
          what="this session's module output"
          onRetry={retryRead}
          detail={readError}
          className="mx-2 my-1"
        />
      ) : null}
      {readError && segments.length === 0 ? (
        <ReadFailure error={readError} what="this session's module output" onRetry={retryRead} />
      ) : !moduleDef ? (
        <ColumnEmptyState
          title={`Unknown module "${moduleId}"`}
          description="Switch to a registered module via the settings sidebar."
        />
      ) : segments.length === 0 ? (
        <ColumnEmptyState
          title={isRunning ? `Running ${moduleDef.label}…` : moduleDef.label}
          description={
            latestRun?.status === "failed"
              ? "Last run failed. Recording continues; the next tick retries."
              : moduleDef.description
          }
        />
      ) : (
        <div
          ref={scrollRef}
          onWheel={onPointerLead}
          onTouchStart={onPointerLead}
          onPointerDown={onPointerLead}
          className="flex-1 min-h-0 overflow-y-auto py-1.5"
        >
          {segments.map((seg) => (
            <ModuleSegmentRender
              key={seg.id}
              segment={seg}
              onSave={(text) =>
                void dispatch(
                  updateModuleSegmentPayloadThunk({
                    sessionId,
                    segmentId: seg.id,
                    payload: text,
                  }),
                )
              }
              onDelete={() =>
                void dispatch(
                  deleteModuleSegmentThunk({
                    sessionId,
                    segmentId: seg.id,
                  }),
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Render one module segment via the canonical `MarkdownStream` component.
 *
 * `MarkdownStream` is the universal markdown renderer for the platform —
 * it owns the block-registry dispatch, code highlighting, and lazy-loaded
 * heavy deps (jspdf, html2canvas, etc.) and is dynamic-imported with
 * `ssr: false` so none of that touches the studio page's SSR.
 *
 * The agent's payload is markdown — `tasks` modules emit a markdown
 * checklist, future modules will emit `<flashcards>`/`<quiz>` blocks the
 * same way the chat surface does. MarkdownStream parses the block type out
 * of the content and dispatches to the right renderer.
 */
interface ModuleSegmentRenderProps {
  segment: ModuleSegment;
  onSave: (text: string) => void;
  onDelete: () => void;
}

function ModuleSegmentRender({
  segment,
  onSave,
  onDelete,
}: ModuleSegmentRenderProps) {
  const content =
    typeof segment.payload === "string"
      ? segment.payload
      : JSON.stringify(segment.payload, null, 2);
  return (
    <SegmentWrapper
      column={COLUMN_IDS.module}
      tStart={segment.tStart ?? 0}
      tEnd={segment.tEnd ?? segment.tStart ?? 0}
      className="px-2"
    >
      <EditableTextSegmentRow
        text={content}
        itemKind="module pass"
        onSave={onSave}
        onDelete={onDelete}
      >
        <div className="pr-12">
          {/* A structured payload is drawn as itself (a kind as its kind
              component), never stringified into markdown; only the explicit
              edit mode above works on its JSON text. */}
          {typeof segment.payload === "string" ? (
            <RichContent level="full" imagePolicy="ai" source={content} hideCopyButton />
          ) : (
            <AnswerValueView value={segment.payload} />
          )}
        </div>
      </EditableTextSegmentRow>
    </SegmentWrapper>
  );
}
