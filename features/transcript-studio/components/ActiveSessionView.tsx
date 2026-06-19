"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2, Trash2 } from "lucide-react";
import type { Layout } from "react-resizable-panels";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResizablePanel } from "@/components/ui/resizable";
import { ProcessForRagButton } from "@/features/rag/components/ProcessForRagButton";
import { cn } from "@/lib/utils";
import {
  deleteSessionThunk,
  fetchCleanedSegmentsThunk,
  fetchConceptItemsThunk,
  fetchModuleSegmentsThunk,
  fetchRawSegmentsThunk,
} from "../redux/thunks";
import type { StudioSession } from "../types";
import { RecordButton } from "./recording/RecordButton";
import { SaveAsTranscriptButton } from "./conversion/SaveAsTranscriptButton";
import { CleanedTranscriptColumn } from "./columns/CleanedTranscriptColumn";
import { ConceptsColumn } from "./columns/ConceptsColumn";
import { ModuleColumn } from "./columns/ModuleColumn";
import { RawTranscriptColumn } from "./columns/RawTranscriptColumn";
import {
  STUDIO_COLUMN_PANEL_IDS,
  StudioColumnHandle,
  StudioPanelGroup,
} from "./resize/StudioPanelGroup";
import { ScrollSyncProvider } from "./scroll-sync/ScrollSyncProvider";
import { SettingsSidebar } from "./settings/SettingsSidebar";
import { StudioColumnsMobile } from "./StudioColumnsMobile";
import { DictionaryIndicatorButton } from "@/features/dictionary/components/DictionaryIndicatorButton";
import { useStudioAutoLabel } from "../hooks/useStudioAutoLabel";
import { useStudioSession } from "../hooks/useStudioSession";
import { useStudioSettings } from "../hooks/useStudioSettings";
import { useTriggerScheduler } from "../hooks/useTriggerScheduler";
import { useIsMobile } from "@/hooks/use-mobile";
import { getModule } from "../modules/registry";
import { EditableSessionTitle } from "./EditableSessionTitle";

// Side-effect import — populates the module registry so getModule(id) works
// from the moment any session view mounts. Adding a new module is a one-line
// import inside `modules/index.ts`.
import "../modules";

interface ActiveSessionViewProps {
  session: StudioSession;
  /** Server-supplied layout from the studio columns cookie. */
  defaultColumnLayout?: Layout;
  /** Called after delete so the page route can clear `?session=`. */
  onSessionDeleted?: () => void;
}

/**
 * Active-session view (Phase 4): header + 4-column resizable shell wrapped
 * in the scroll-sync provider. Columns 2/3/4 are placeholder shells until
 * Phases 5-7 ship their respective agents and renderers; the resizable
 * geometry, persistence, and sync-scroll plumbing are all in place now so
 * later phases just drop content into existing columns.
 */
export function ActiveSessionView({
  session,
  defaultColumnLayout,
  onSessionDeleted,
}: ActiveSessionViewProps) {
  const dispatch = useAppDispatch();
  const recording = useStudioSession({ sessionId: session.id });

  // First-paint hydration of raw + cleaned + concept registries. Subscribes
  // to stable booleans — doesn't re-fire on every appended chunk.
  const hasRawIds = useAppSelector((state) =>
    Boolean(state.transcriptStudio.rawIdsBySession[session.id]),
  );
  const hasCleanedIds = useAppSelector((state) =>
    Boolean(state.transcriptStudio.cleanedIdsBySession[session.id]),
  );
  const hasConceptIds = useAppSelector((state) =>
    Boolean(state.transcriptStudio.conceptIdsBySession[session.id]),
  );
  const hasModuleSegmentIds = useAppSelector((state) =>
    Boolean(state.transcriptStudio.moduleSegmentIdsBySession[session.id]),
  );
  useEffect(() => {
    if (!hasRawIds) {
      void dispatch(fetchRawSegmentsThunk({ sessionId: session.id }));
    }
    if (!hasCleanedIds) {
      void dispatch(fetchCleanedSegmentsThunk({ sessionId: session.id }));
    }
    if (!hasConceptIds) {
      void dispatch(fetchConceptItemsThunk({ sessionId: session.id }));
    }
    if (!hasModuleSegmentIds) {
      void dispatch(fetchModuleSegmentsThunk({ sessionId: session.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, dispatch]);

  // Per-session settings — feeds the trigger scheduler with effective
  // intervals (per-session overrides clamped to DB-enforced bounds, or
  // global defaults when no row exists yet).
  const { effective: studioSettings } = useStudioSettings(session.id);

  // Drive Columns 2/3/4 ticks while recording. Survives unmount only if
  // you stay on the studio route — leaving pauses agent passes until you
  // return. Recording itself lives in the global provider and continues.
  useTriggerScheduler({
    sessionId: session.id,
    cleaningIntervalMs: studioSettings.cleaningIntervalMs,
    conceptIntervalMs: studioSettings.conceptIntervalMs,
    moduleIntervalMs: studioSettings.moduleIntervalMs,
  });

  // Auto-derive a session title from the first few raw segments while the
  // session still has the placeholder name. Stops once the user renames.
  useStudioAutoLabel({ sessionId: session.id, currentTitle: session.title });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();

  const subtitle = useMemo(() => {
    const created = new Date(session.createdAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const status = session.status === "idle" ? "ready" : session.status;
    const link = session.transcriptId ? "linked" : "standalone";
    return `${status} · ${link} · ${created}`;
  }, [session.createdAt, session.status, session.transcriptId]);

  const moduleLabel =
    getModule(session.moduleId)?.label ?? String(session.moduleId);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-textured">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-1.5 sm:px-4 sm:gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <EditableSessionTitle
            sessionId={session.id}
            title={session.title}
            className="min-w-0 truncate text-sm font-medium"
          />
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <SaveAsTranscriptButton
            sessionId={session.id}
            hasLinkedTranscript={Boolean(session.transcriptId)}
            variant="icon"
          />
          <RecordButton sessionId={session.id} />
          <DictionaryIndicatorButton surfaceKey="matrx-user/transcript-studio" />
          <ProcessForRagButton
            sourceKind="transcript"
            sourceId={session.id}
            iconOnly
            force
            onComplete={() => {
              toast.success("Transcript indexed for RAG", {
                action: {
                  label: "View in library",
                  onClick: () => router.push("/rag/library"),
                },
              });
            }}
          />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open session settings"
            title="Session settings"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete session"
            title="Delete session"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              "text-muted-foreground hover:bg-destructive/15 hover:text-destructive",
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <SettingsSidebar
        sessionId={session.id}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete session?"
        description={
          <>
            Permanently remove <b>{session.title}</b> and all of its raw,
            cleaned, concept, and module data. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          setConfirmDelete(false);
          void dispatch(deleteSessionThunk(session.id)).then(() => {
            onSessionDeleted?.();
          });
        }}
      />

      <div
        className={cn(
          "flex flex-1 min-h-0 flex-col overflow-hidden",
          isMobile ? "p-0" : "p-2",
        )}
      >
        <div
          className={cn(
            "flex flex-1 min-h-0 overflow-hidden bg-background",
            !isMobile && "rounded-md border border-border/60",
          )}
        >
          <ScrollSyncProvider sessionId={session.id}>
            {isMobile ? (
              <StudioColumnsMobile
                moduleLabel={moduleLabel}
                raw={
                  <RawTranscriptColumn
                    sessionId={session.id}
                    isRecording={recording.isOwnedRecording}
                  />
                }
                cleaned={<CleanedTranscriptColumn sessionId={session.id} />}
                concepts={<ConceptsColumn sessionId={session.id} />}
                module={<ModuleColumn sessionId={session.id} />}
              />
            ) : (
              <StudioPanelGroup defaultLayout={defaultColumnLayout}>
                <ResizablePanel
                  id={STUDIO_COLUMN_PANEL_IDS.raw}
                  defaultSize="35%"
                  minSize="15%"
                  style={{ overflow: "hidden", height: "100%" }}
                >
                  <RawTranscriptColumn
                    sessionId={session.id}
                    isRecording={recording.isOwnedRecording}
                  />
                </ResizablePanel>

                <StudioColumnHandle />

                <ResizablePanel
                  id={STUDIO_COLUMN_PANEL_IDS.cleaned}
                  defaultSize="35%"
                  minSize="15%"
                  style={{ overflow: "hidden", height: "100%" }}
                >
                  <CleanedTranscriptColumn sessionId={session.id} />
                </ResizablePanel>

                <StudioColumnHandle />

                <ResizablePanel
                  id={STUDIO_COLUMN_PANEL_IDS.concepts}
                  defaultSize="15%"
                  minSize="10%"
                  style={{ overflow: "hidden", height: "100%" }}
                >
                  <ConceptsColumn sessionId={session.id} />
                </ResizablePanel>

                <StudioColumnHandle />

                <ResizablePanel
                  id={STUDIO_COLUMN_PANEL_IDS.module}
                  defaultSize="15%"
                  minSize="10%"
                  style={{ overflow: "hidden", height: "100%" }}
                >
                  <ModuleColumn sessionId={session.id} />
                </ResizablePanel>
              </StudioPanelGroup>
            )}
          </ScrollSyncProvider>
        </div>
      </div>
    </div>
  );
}
