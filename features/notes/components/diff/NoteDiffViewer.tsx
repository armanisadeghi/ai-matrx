"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AlignLeft, Braces, Columns2, FileText, List } from "lucide-react";
import { computeDiff } from "@ai-matrx/diff/structural";
import { createAdapterRegistry } from "@ai-matrx/diff/react";
import { AllChangesView } from "@ai-matrx/diff/react";
import { ChangesOnlyView } from "@ai-matrx/diff/react";
import { SummaryView } from "@ai-matrx/diff/react";
import { RawJsonView } from "@ai-matrx/diff/react";
import { TextDiff, type TextDiffView } from "@ai-matrx/diff/react";
import { useMeasure } from "@ai-matrx/kit/hooks";
import {
  TextFieldAdapter,
  TagsFieldAdapter,
  JsonObjectAdapter,
} from "@ai-matrx/diff/react";
import type { DiffNode } from "@ai-matrx/diff/structural";
import type { Note } from "@/features/notes/types";
import { NOTE_DIFF_OPTIONS, NOTE_PRIORITY_FIELDS } from "./note-diff-constants";
import { NoteContentAdapter } from "./adapters/NoteContentAdapter";

interface NoteDiffViewerProps {
  oldNote: Partial<Note>;
  newNote: Partial<Note>;
  oldLabel: string;
  newLabel: string;
  /**
   * Default tab. Content = side-by-side body only (the common case).
   * All / Changes / Summary / JSON keep the structured field diff.
   */
  defaultTab?: NoteDiffTab;
  className?: string;
}

/**
 * Below this container width two side-by-side columns cut words mid-line
 * ("separat"), so the Content diff stacks (one column, old above new). A
 * container query, not a viewport one: a 360px canvas pane on a wide monitor
 * is just as narrow as a phone.
 */
const SPLIT_MIN_WIDTH_PX = 560;

export type NoteDiffTab =
  "content" | "all" | "changes-only" | "summary" | "raw-json";

function buildNoteAdapterRegistry() {
  const registry = createAdapterRegistry();

  registry.register("content", NoteContentAdapter);
  registry.register("label", { ...TextFieldAdapter, label: "Title" });
  registry.register("folder_name", { ...TextFieldAdapter, label: "Folder" });
  registry.register("folder_id", { ...TextFieldAdapter, label: "Folder ID" });
  registry.register("tags", { ...TagsFieldAdapter, label: "Tags" });
  registry.register("shown_to", { ...TextFieldAdapter, label: "Shown to" });
  registry.register("published_to_web", {
    ...TextFieldAdapter,
    label: "Published to the web",
  });
  registry.register("metadata", { ...JsonObjectAdapter, label: "Metadata" });
  registry.register("organization_id", {
    ...TextFieldAdapter,
    label: "Organization",
  });
  registry.register("project_id", { ...TextFieldAdapter, label: "Project" });
  registry.register("task_id", { ...TextFieldAdapter, label: "Task" });

  return registry;
}

function reorderNodes(nodes: DiffNode[]): DiffNode[] {
  const priority: DiffNode[] = [];
  const rest: DiffNode[] = [];

  for (const node of nodes) {
    if (NOTE_PRIORITY_FIELDS.includes(node.key)) {
      priority.push(node);
    } else {
      rest.push(node);
    }
  }

  priority.sort(
    (a, b) =>
      NOTE_PRIORITY_FIELDS.indexOf(a.key) - NOTE_PRIORITY_FIELDS.indexOf(b.key),
  );

  return [...priority, ...rest];
}

const TAB_CONFIG: {
  value: NoteDiffTab;
  label: string;
  icon: typeof AlignLeft;
}[] = [
  { value: "content", label: "Content", icon: AlignLeft },
  { value: "all", label: "All", icon: Columns2 },
  { value: "changes-only", label: "Changes", icon: FileText },
  { value: "summary", label: "Summary", icon: List },
  { value: "raw-json", label: "JSON", icon: Braces },
];

/**
 * Notes version compare. Default tab is **Content** — a full-bleed side-by-side
 * text diff of the note body. Structured field diffs (folder, tags, …) live
 * under All / Changes / Summary / JSON so they don't steal the first viewport.
 */
export function NoteDiffViewer({
  oldNote,
  newNote,
  oldLabel,
  newLabel,
  defaultTab = "content",
  className,
}: NoteDiffViewerProps) {
  const [tab, setTab] = useState<NoteDiffTab>(defaultTab);
  // The view follows the container until the person picks one in the toolbar.
  const [pickedView, setPickedView] = useState<TextDiffView | null>(null);
  const [contentRef, { width: contentWidth }] = useMeasure<HTMLDivElement>();
  const narrow =
    (contentWidth ?? 0) > 0 && (contentWidth ?? 0) < SPLIT_MIN_WIDTH_PX;
  const contentView: TextDiffView = pickedView ?? (narrow ? "inline" : "split");
  const adapters = useMemo(() => buildNoteAdapterRegistry(), []);

  const oldContent = typeof oldNote.content === "string" ? oldNote.content : "";
  const newContent = typeof newNote.content === "string" ? newNote.content : "";

  const diffResult = useMemo(() => {
    // Compare like with like: a version snapshot carries only the fields it
    // saved (label, content, folder, tags…), while the live note carries every
    // column. Fields the snapshot never had are not changes — counting them
    // printed "+13 added" over a Content tab that (correctly) said "No changes".
    const comparableNew = Object.fromEntries(
      Object.entries(newNote as Record<string, unknown>).filter(
        ([key]) => key in oldNote,
      ),
    );
    const result = computeDiff(
      oldNote as Record<string, unknown>,
      comparableNew,
      NOTE_DIFF_OPTIONS,
    );
    return { ...result, root: reorderNodes(result.root) };
  }, [oldNote, newNote]);

  const { stats, hasChanges } = diffResult;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as NoteDiffTab)}
        className="flex h-full min-h-0 flex-col"
      >
        {/* The bar answers its OWN width: in a 360px canvas pane the five
            tabs keep their icons and drop their words (kept as names and
            tooltips) instead of clipping the last one. */}
        <div className="@container/diffbar flex shrink-0 items-center gap-3 border-b border-border bg-card/50 px-3 py-1.5">
          <TabsList className="min-w-0 shrink-0">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                aria-label={label}
                title={label}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden @[30rem]/diffbar:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex-1" />
          {hasChanges ? (
            <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs">
              {stats.added > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  +{stats.added} added
                </span>
              )}
              {stats.removed > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  -{stats.removed} removed
                </span>
              )}
              {stats.modified > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  ~{stats.modified} modified
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No changes</span>
          )}
        </div>

        <TabsContent
          value="content"
          className="mt-0 min-h-0 flex-1 overflow-hidden"
        >
          <div
            ref={contentRef}
            className="h-full min-h-0"
            data-diff-layout={contentView === "split" ? "split" : "stacked"}
          >
            <TextDiff
              original={oldContent}
              modified={newContent}
              originalLabel={oldLabel}
              modifiedLabel={newLabel}
              view={contentView}
              onViewChange={setPickedView}
              showToolbar
              wrap
              className="h-full"
              diffOptions={{ wordLevel: true, granularity: "word" }}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="all"
          className="mt-0 min-h-0 flex-1 overflow-y-auto"
        >
          <AllChangesView
            diffResult={diffResult}
            adapters={adapters}
            oldLabel={oldLabel}
            newLabel={newLabel}
          />
        </TabsContent>

        <TabsContent
          value="changes-only"
          className="mt-0 min-h-0 flex-1 overflow-y-auto"
        >
          <ChangesOnlyView
            diffResult={diffResult}
            adapters={adapters}
            oldLabel={oldLabel}
            newLabel={newLabel}
          />
        </TabsContent>

        <TabsContent
          value="summary"
          className="mt-0 min-h-0 flex-1 overflow-y-auto"
        >
          <SummaryView diffResult={diffResult} adapters={adapters} />
        </TabsContent>

        <TabsContent
          value="raw-json"
          className="mt-0 min-h-0 flex-1 overflow-hidden"
        >
          {tab === "raw-json" ? (
            <RawJsonView
              oldValue={oldNote}
              newValue={newNote}
              oldLabel={oldLabel}
              newLabel={newLabel}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
