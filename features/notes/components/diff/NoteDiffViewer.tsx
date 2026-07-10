"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AlignLeft, Braces, Columns2, FileText, List } from "lucide-react";
import { computeDiff } from "@/components/diff/engine/compute-diff";
import { createAdapterRegistry } from "@/components/diff/adapters/registry";
import { AllChangesView } from "@/components/diff/views/AllChangesView";
import { ChangesOnlyView } from "@/components/diff/views/ChangesOnlyView";
import { SummaryView } from "@/components/diff/views/SummaryView";
import { RawJsonView } from "@/components/diff/views/RawJsonView";
import { TextDiff } from "@/components/diff/text/TextDiff";
import {
  TextFieldAdapter,
  TagsFieldAdapter,
  JsonObjectAdapter,
} from "@/components/diff/adapters/defaults";
import type { DiffNode } from "@/components/diff/engine/types";
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

export type NoteDiffTab =
  "content" | "all" | "changes-only" | "summary" | "raw-json";

function buildNoteAdapterRegistry() {
  const registry = createAdapterRegistry();

  registry.register("content", NoteContentAdapter);
  registry.register("label", { ...TextFieldAdapter, label: "Title" });
  registry.register("folder_name", { ...TextFieldAdapter, label: "Folder" });
  registry.register("folder_id", { ...TextFieldAdapter, label: "Folder ID" });
  registry.register("tags", { ...TagsFieldAdapter, label: "Tags" });
  registry.register("visibility", { ...TextFieldAdapter, label: "Visibility" });
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
  const adapters = useMemo(() => buildNoteAdapterRegistry(), []);

  const oldContent = typeof oldNote.content === "string" ? oldNote.content : "";
  const newContent = typeof newNote.content === "string" ? newNote.content : "";

  const diffResult = useMemo(() => {
    const result = computeDiff(
      oldNote as Record<string, unknown>,
      newNote as Record<string, unknown>,
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
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/50 px-3 py-1.5">
          <TabsList className="h-7 bg-muted/50 p-0.5">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-6 gap-1 px-2 text-xs data-[state=active]:bg-background"
              >
                <Icon className="h-3 w-3" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex-1" />
          {hasChanges ? (
            <div className="flex items-center gap-2 text-[0.625rem]">
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
          <TextDiff
            original={oldContent}
            modified={newContent}
            originalLabel={oldLabel}
            modifiedLabel={newLabel}
            defaultView="split"
            showToolbar
            wrap
            className="h-full"
            diffOptions={{ wordLevel: true, granularity: "word" }}
          />
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
