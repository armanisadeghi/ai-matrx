"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  HelpCircle,
  Lightbulb,
  RefreshCw,
  Zap,
  Tag,
  Target,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { COLUMN_IDS } from "../../constants";
import { runConceptPassThunk } from "../../redux/runConceptPass.thunk";
import {
  deleteConceptItemThunk,
  updateConceptItemThunk,
} from "../../redux/thunks";
import type { ConceptItem, ConceptKind } from "../../types";
import { useScrollSyncOptional } from "../scroll-sync/ScrollSyncProvider";
import { ColumnEmptyState } from "./ColumnEmptyState";
import { ColumnHeader } from "./ColumnHeader";
import { EditableConceptRow } from "./EditableConceptRow";
import { SegmentWrapper } from "./SegmentWrapper";

interface ConceptsColumnProps {
  sessionId: string;
  className?: string;
}

const KIND_ICON: Record<ConceptKind, LucideIcon> = {
  theme: Target,
  key_idea: Lightbulb,
  entity: Tag,
  question: HelpCircle,
  other: Zap,
};

const KIND_LABEL: Record<ConceptKind, string> = {
  theme: "theme",
  key_idea: "key idea",
  entity: "entity",
  question: "question",
  other: "other",
};

const KIND_COLOR: Record<ConceptKind, string> = {
  theme: "text-purple-600 dark:text-purple-400",
  key_idea: "text-amber-600 dark:text-amber-400",
  entity: "text-emerald-600 dark:text-emerald-400",
  question: "text-blue-600 dark:text-blue-400",
  other: "text-muted-foreground",
};

function formatTimecode(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return null;
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${mm.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ConceptsColumn({ sessionId, className }: ConceptsColumnProps) {
  const ids = useAppSelector(
    (state) => state.transcriptStudio.conceptIdsBySession[sessionId],
  );
  const byId = useAppSelector(
    (state) => state.transcriptStudio.conceptsById[sessionId],
  );
  const items = useMemo<ConceptItem[]>(() => {
    if (!ids || !byId) return [];
    const out: ConceptItem[] = [];
    for (const id of ids) {
      const it = byId[id];
      if (it) out.push(it);
    }
    return out;
  }, [ids, byId]);

  const runIds = useAppSelector(
    (state) => state.transcriptStudio.runIdsBySession[sessionId],
  );
  const runsById = useAppSelector(
    (state) => state.transcriptStudio.runsById[sessionId],
  );
  const latestRun = useMemo(() => {
    if (!runIds || !runsById) return null;
    for (let i = runIds.length - 1; i >= 0; i--) {
      const r = runsById[runIds[i]!];
      if (r?.columnIdx === 3) return r;
    }
    return null;
  }, [runIds, runsById]);

  const isRunning = latestRun?.status === "running";
  const dotState =
    isRunning ? "running" : latestRun?.status === "failed" ? "error" : "idle";
  const status = useMemo(() => {
    if (items.length === 0) return isRunning ? "running…" : undefined;
    return `${items.length} concept${items.length === 1 ? "" : "s"}${isRunning ? " · running" : ""}`;
  }, [items, isRunning]);

  const sync = useScrollSyncOptional();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sync) return;
    sync.registerColumn(COLUMN_IDS.concepts, scrollRef.current);
    return () => sync.registerColumn(COLUMN_IDS.concepts, null);
  }, [sync]);
  const onPointerLead = sync
    ? () => sync.markLeader(COLUMN_IDS.concepts)
    : undefined;
  const onConceptClick = (item: ConceptItem) => {
    if (sync && item.tStart !== null) {
      sync.scrollAllTo(item.tStart, COLUMN_IDS.concepts);
    }
  };

  const dispatch = useAppDispatch();
  const handleManualRun = () => {
    if (isRunning) return;
    void dispatch(
      runConceptPassThunk({ sessionId, triggerCause: "manual" }),
    );
  };
  const manualButton = (
    <button
      type="button"
      onClick={handleManualRun}
      disabled={isRunning}
      title={
        isRunning
          ? "A concept extraction pass is already running"
          : "Extract concepts now"
      }
      aria-label="Extract concepts now"
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
        isRunning
          ? "text-muted-foreground/50 cursor-not-allowed"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <RefreshCw className={cn("h-3 w-3", isRunning && "animate-spin")} />
    </button>
  );

  const sessionTitle = useAppSelector(
    (state) => state.transcriptStudio.byId[sessionId]?.title,
  );

  const exportMarkdown = useMemo(() => {
    if (items.length === 0) return "";
    const groups = new Map<ConceptKind, ConceptItem[]>();
    for (const item of items) {
      const list = groups.get(item.kind) ?? [];
      list.push(item);
      groups.set(item.kind, list);
    }
    const sections: string[] = [];
    for (const [kind, list] of groups) {
      const heading = KIND_LABEL[kind].replace(/^./, (c) => c.toUpperCase());
      const lines = list.map((it) => {
        const tc = formatTimecode(it.tStart);
        const time = tc ? ` *(${tc})*` : "";
        const desc = it.description ? `\n  ${it.description}` : "";
        return `- **${it.label}**${time}${desc}`;
      });
      sections.push(`## ${heading}s\n\n${lines.join("\n")}`);
    }
    return sections.join("\n\n");
  }, [items]);

  const headerActions = (
    <>
      {manualButton}
      {items.length > 0 && (
        <ContentActionBar
          content={exportMarkdown}
          title={
            sessionTitle ? `Concepts — ${sessionTitle}` : "Concepts"
          }
          metadata={{
            source: "transcript-studio",
            column: "concepts",
            session_id: sessionId,
            session_title: sessionTitle,
            concept_count: items.length,
          }}
          instanceKey={`studio-concepts-${sessionId}`}
          hideSpeaker
          hidePencil
        />
      )}
    </>
  );

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
      aria-label="Concepts"
    >
      <ColumnHeader
        icon={Lightbulb}
        label="Concepts"
        status={status}
        dotState={dotState}
        actions={headerActions}
      />
      {items.length === 0 ? (
        <ColumnEmptyState
          icon={Lightbulb}
          title={
            isRunning
              ? "Extracting concepts…"
              : "Concept extraction every 200s"
          }
          description={
            latestRun?.status === "failed"
              ? "Last extraction failed. Recording continues; the next tick retries."
              : "Themes, key ideas, named entities, and open questions surface here."
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
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const tc = formatTimecode(item.tStart);
            return (
              <SegmentWrapper
                key={item.id}
                column={COLUMN_IDS.concepts}
                tStart={item.tStart ?? 0}
                tEnd={item.tEnd ?? item.tStart ?? 0}
              >
                <EditableConceptRow
                  item={item}
                  displayClickable={item.tStart !== null}
                  onClickJump={() => onConceptClick(item)}
                  onSave={(patch) =>
                    void dispatch(
                      updateConceptItemThunk({
                        sessionId,
                        itemId: item.id,
                        patch,
                      }),
                    )
                  }
                  onDelete={() =>
                    void dispatch(
                      deleteConceptItemThunk({
                        sessionId,
                        itemId: item.id,
                      }),
                    )
                  }
                  display={
                    <>
                      <div className="flex items-center gap-1.5">
                        <Icon
                          className={cn(
                            "h-3 w-3 shrink-0",
                            KIND_COLOR[item.kind],
                          )}
                        />
                        <span
                          className={cn(
                            "text-[10px] font-medium uppercase tracking-wide",
                            KIND_COLOR[item.kind],
                          )}
                        >
                          {KIND_LABEL[item.kind]}
                        </span>
                        {tc && (
                          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/70">
                            {tc}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium leading-tight">
                        {item.label}
                      </div>
                      {item.description && (
                        <div className="text-[11px] leading-snug text-muted-foreground">
                          {item.description}
                        </div>
                      )}
                    </>
                  }
                />
              </SegmentWrapper>
            );
          })}
        </div>
      )}
    </section>
  );
}
