"use client";

import React, { useState } from "react";
import { ChevronRight, Settings2, Bug, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotesResourcePicker } from "./NotesResourcePicker";
import { TasksResourcePicker } from "./TasksResourcePicker";
import { FilesResourcePicker } from "./FilesResourcePicker";
import { TablesResourcePicker } from "./TablesResourcePicker";
import { WebpageResourcePicker } from "./WebpageResourcePicker";
import { InlineUploadArea } from "./InlineUploadArea";
import { YouTubeResourcePicker } from "./YouTubeResourcePicker";
import { ImageUrlResourcePicker } from "./ImageUrlResourcePicker";
import { FileUrlResourcePicker } from "./FileUrlResourcePicker";
import { AudioResourcePicker } from "./AudioResourcePicker";
import { WorkbooksResourcePicker } from "./WorkbooksResourcePicker";
import { DocumentsResourcePicker } from "./DocumentsResourcePicker";
import { ContextValuesResourcePicker } from "./ContextValuesResourcePicker";
import { ComposerConnectorsPanel } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerConnectorsPanel";
import { ToolsResourcePicker } from "./ToolsResourcePicker";
import { SkillsResourcePicker } from "./SkillsResourcePicker";
import { ConversationReferencePicker } from "./ConversationReferencePicker";
import { appendConversationReference } from "./conversation-reference-context";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";
import { toast } from "@/lib/toast";
import type { GoogleWorkspaceResourceType } from "@/features/google-workspace/resource-types";
import { GoogleResourcePicker } from "./GoogleResourcePicker";
import { useOpenCloudBrowserCanvas } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { setContextEntry } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  GOOGLE_FILES_CONTEXT_KEY,
  EMPTY_GOOGLE_FILE_IDS,
  selectGoogleFileIds,
} from "@/features/google-workspace/attach/googleFileContext";
import { useAppDispatch, useAppStore, useAppSelector } from "@/lib/redux/hooks";
import { ResourcePickerTiles } from "./ResourcePickerTiles";
import {
  flattenResourcePickerItems,
  getVisibleResourcePickerCategories,
  resourcePickerItemsAsTiles,
  type ResourcePickerViewId,
} from "./resource-picker-menu-items";
import { useRunControlCounts } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useRunControlCounts";
import type { Resource } from "@ai-matrx/chat/agents/resources/types";
import { noteResourceData, projectResourceData, taskResourceData } from "./resource-adapters";
import { useKnowledgeAttachSearch } from "./useKnowledgeAttachSearch";
import { useAttachedFileIds } from "@ai-matrx/chat/agents/components/inputs/resources/useAttachedFileIds";

type FilesPickerProps = React.ComponentProps<typeof FilesResourcePicker>;

/** Ticks the files already on the conversation; a host with none passes through. */
function ConversationFilesPicker({
  conversationId,
  ...props
}: FilesPickerProps & { conversationId?: string }) {
  if (!conversationId) return <FilesResourcePicker {...props} />;
  return <AttachedFilesPicker conversationId={conversationId} {...props} />;
}

function AttachedFilesPicker({
  conversationId,
  ...props
}: FilesPickerProps & { conversationId: string }) {
  const attached = useAttachedFileIds(conversationId);
  return <FilesResourcePicker {...props} selectedFileIds={attached} />;
}


interface ResourcePickerMenuProps {
  onResourceSelected(
    resource: Resource,
  ): boolean | void | Promise<boolean | void>;
  onResourceDeselected?(
    resource: Resource,
  ): boolean | void | Promise<boolean | void>;
  onClose: () => void;
  /**
   * Called after a value is picked (note, file, chat, Google file) instead of
   * `onClose`. A host that lets the person keep going — the phone "Chat
   * options" sheet returns to its tab list — passes it; leaving actions
   * (knowledge bar, Connections, Cloud browser, Settings) still call onClose.
   */
  onPicked?: () => void;
  /** Required for Tools / Skills / Settings in-place pickers. */
  conversationId?: string;
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };
  onSettingsClick?: () => void;
  onDebugClick?: () => void;
  showDebugActive?: boolean;
  /** Limit the canonical picker to resource kinds supported by this host. */
  allowedViewIds?: readonly Exclude<ResourcePickerViewId, null>[];
  /**
   * List pickers attach repeatedly by default. Single-value hosts (for
   * example, a scalar agent setting) opt into closing after the first pick.
   * Direct-entry pickers such as URL and YouTube remain one-and-done in both
   * modes because they produce one resource per completed form.
   */
  selectionMode?: "single" | "multiple";
  /** Fill a definite-height host and let each drill-in own its scroll area. */
  fillHost?: boolean;
  /** Open straight into one view (a host re-opening the picker at a command). */
  initialView?: ResourcePickerViewId;
  /**
   * The host can re-open its own picker at a view after it closed. The
   * picker's non-search views (Upload, URL entry, Voice, Tools…) are ALWAYS
   * commands in the ⌘K bar its search row opens: with this, they re-open the
   * host's picker there; without it, they open the same picker in a window at
   * that view, wired to this host's own handlers.
   */
  onReopenAt?: (view: Exclude<ResourcePickerViewId, null>) => void;
  /**
   * With `initialView`: Back from that view calls this instead of revealing
   * the list — the composer's cascading + menu hosts each picker directly and
   * closes its cascade on Back.
   */
  onExitInitialView?: () => void;
  /** Files view: files the host already chose (phone Camera / Photos). */
  initialUploadFiles?: readonly File[];
}

export function ResourcePickerMenu({
  onResourceSelected,
  onResourceDeselected,
  onClose,
  onPicked,
  conversationId,
  attachmentCapabilities,
  onSettingsClick,
  onDebugClick,
  showDebugActive,
  allowedViewIds,
  selectionMode = "multiple",
  fillHost = false,
  initialView = null,
  onReopenAt,
  onExitInitialView,
  initialUploadFiles,
}: ResourcePickerMenuProps) {
  const finishPick = onPicked ?? onClose;
  const [activeView, setActiveView] = useState<ResourcePickerViewId>(initialView);
  const goBack = () => {
    if (initialView && onExitInitialView) {
      onExitInitialView();
      return;
    }
    setActiveView(null);
  };
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const openCloudBrowser = useOpenCloudBrowserCanvas();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Run-state counts for the "This run" rows only — see useRunControlCounts.
  const runCounts = useRunControlCounts(conversationId);
  // The package types the counts as an interface (tools, skills); the tiles take a
  // keyed lookup, so name the two keys instead of leaning on an index signature.
  const counts: Partial<Record<string, number>> = {
    tools: runCounts.tools,
    skills: runCounts.skills,
  };

  // Helper to switch views and carry over the URL
  const switchToView = (view: ResourcePickerViewId, url: string) => {
    setCurrentUrl(url);
    setActiveView(view);
  };

  const menuItems = flattenResourcePickerItems();
  const visibleCategories = getVisibleResourcePickerCategories(
    attachmentCapabilities,
    { conversationId, allowedViewIds },
  );
  // The search step hands off to ⌘K (useKnowledgeAttachSearch).
  const openAttachSearch = useKnowledgeAttachSearch({
    conversationId,
    onResourceSelected,
    onResourceDeselected,
    attachmentCapabilities,
    allowedViewIds,
    selectionMode,
    onReopenAt,
  });
  const openKnowledgeSearch = () => {
    onClose();
    openAttachSearch();
  };
  /**
   * Attached Google files ride the reserved `__google_files` context key rather
   * than a `content[]` block, because the server side of this is a context
   * directive: it names the files for the agent AND injects the Google tool for
   * the turn (aidream `services/google_workspace/attachments.py`). A content
   * block would deliver the first half and not the second.
   */
  const attachedGoogleFileIds = useAppSelector((state) =>
    conversationId
      ? selectGoogleFileIds(state, conversationId)
      : EMPTY_GOOGLE_FILE_IDS,
  );

  const attachGoogleFile = (file: {
    fileId: string;
    name: string;
    resourceType: GoogleWorkspaceResourceType;
  }) => {
    if (!conversationId) {
      // Never a dead click. Every host that shows this row has a conversation
      // (chat mints the id before the first message), so this is a guard, not a
      // path — but a silent return would be indistinguishable from a bug.
      toast.error(
        "Start a conversation first — there is nowhere to attach this yet.",
      );
      return;
    }
    // Read at click time so rapid multi-picks cannot overwrite the file added
    // by the previous dispatch before React has rendered the new selector.
    const current = selectGoogleFileIds(store.getState(), conversationId);
    const next = current.includes(file.fileId)
      ? [...current]
      : [...current, file.fileId];
    dispatch(
      setContextEntry({
        conversationId,
        key: GOOGLE_FILES_CONTEXT_KEY,
        value: next,
        label: "Attached Google files",
      }),
    );
    toast.success(`${file.name} attached.`);
    finishPick();
  };

  const selectResource = async (resource: Resource, listSelection: boolean) => {
    const selected = await onResourceSelected(resource);
    if (selected !== false && (!listSelection || selectionMode === "single")) {
      finishPick();
    }
    return selected;
  };

  /**
   * THE ONE CLOSE RULE (real-test friction PB-01…PB-04, 2026-10-01): a
   * CHECKBOX toggles and stays — the Files list shows each file's ticked state
   * and unticking detaches, so the menu stays open for the next tick. A ROW
   * CLICK (a note, a task, a table, a context value's Assign, a chat, a URL
   * form) COMPLETES an attach and closes the whole menu. Escape closes the
   * whole menu from any depth (ComposerSubmenu). Picking the same thing again
   * is a no-op (useAttachResource is idempotent), so a re-click never stacks
   * duplicate chips.
   */
  const selectOne = (resource: Resource) => selectResource(resource, false);
  const selectFromList = (resource: Resource) => selectResource(resource, true);
  const deselectFromList = (resource: Resource) =>
    onResourceDeselected?.(resource) ?? false;

  // Show specific resource picker based on selection
  if (activeView) {
    if (activeView === "files") {
      // ONE unified Files surface: upload strip on top, stored-file
      // browse/search below (Arman's 2026-08-08 one-entry ruling).
      return (
        <ConversationFilesPicker
          conversationId={conversationId}
          title="Files"
          topSlot={
            <InlineUploadArea
              startWith={initialUploadFiles}
              selectionMode={selectionMode}
              onSelect={async (files) => {
                // Preserve selection order and wait for every durable edge
                // before any host is allowed to dismiss the picker.
                let completed = true;
                for (const file of files) {
                  const selected = await selectFromList({
                    type: "file",
                    data: file,
                  });
                  if (selected === false) {
                    completed = false;
                    break;
                  }
                }
                if (completed && selectionMode === "single") finishPick();
              }}
            />
          }
          onBack={goBack}
          selectionMode={selectionMode}
          fillHost={fillHost}
          onSelect={(selection) =>
            selectFromList({ type: "file", data: selection })
          }
          onDeselect={(selection) =>
            deselectFromList({ type: "file", data: selection })
          }
        />
      );
    }

    if (activeView === "conversations") {
      if (!conversationId) {
        return (
          <div className="p-3 text-xs text-muted-foreground">
            Open a conversation to reference one of your chats.
          </div>
        );
      }
      return (
        <ConversationReferencePicker
          currentConversationId={conversationId}
          onBack={goBack}
          onSelect={(conversation) => {
            // A reference is a RESOURCE, not prose (THE USER-INPUT LAW) — the
            // one writer lives in conversation-reference-context.ts.
            appendConversationReference(
              dispatch,
              store.getState,
              conversationId,
              conversation,
            );
            finishPick();
          }}
        />
      );
    }

    if (activeView === "notes") {
      return (
        <NotesResourcePicker
          onBack={goBack}
          onSelect={(note) => {
            void selectOne({ type: "note", data: noteResourceData(note) });
          }}
        />
      );
    }

    if (activeView === "tasks") {
      return (
        <TasksResourcePicker
          onBack={goBack}
          onSelect={(selection) => {
            void selectOne(
              selection.type === "task"
                ? { type: "task", data: taskResourceData(selection.data) }
                : { type: "project", data: projectResourceData(selection.data) },
            );
          }}
        />
      );
    }

    if (activeView === "google") {
      return (
        <GoogleResourcePicker
          onBack={goBack}
          attachedFileIds={attachedGoogleFileIds}
          onSelect={(file) => attachGoogleFile(file)}
        />
      );
    }

    if (activeView === "workbooks") {
      return (
        <WorkbooksResourcePicker
          onBack={goBack}
          onSelect={(workbook) => {
            void selectOne({
              type: "workbook",
              data: { id: workbook.id, name: workbook.workbook_name },
            });
          }}
        />
      );
    }

    if (activeView === "documents") {
      return (
        <DocumentsResourcePicker
          onBack={goBack}
          onSelect={(document) => {
            void selectOne({
              type: "document",
              data: { id: document.id, title: document.document_name },
            });
          }}
        />
      );
    }

    if (activeView === "tables") {
      return (
        <TablesResourcePicker
          onBack={goBack}
          onSelect={(reference) => {
            void selectOne({ type: "table", data: reference });
          }}
        />
      );
    }

    if (activeView === "webpage") {
      return (
        <WebpageResourcePicker
          onBack={goBack}
          onSelect={(content) => {
            void selectOne({ type: "webpage", data: content });
          }}
          onSwitchTo={(type, url) => switchToView(type, url)}
          initialUrl={currentUrl}
        />
      );
    }

    if (activeView === "youtube") {
      return (
        <YouTubeResourcePicker
          onBack={goBack}
          onSelect={(video) => {
            void selectOne({ type: "youtube", data: video });
          }}
          initialUrl={currentUrl}
        />
      );
    }

    if (activeView === "image_url") {
      return (
        <ImageUrlResourcePicker
          onBack={goBack}
          onSelect={(imageData) => {
            void selectOne({ type: "image_url", data: imageData });
          }}
          onSwitchTo={(type, url) => switchToView(type, url)}
          initialUrl={currentUrl}
        />
      );
    }

    if (activeView === "file_url") {
      return (
        <FileUrlResourcePicker
          onBack={goBack}
          onSelect={(fileData) => {
            void selectOne({ type: "file_url", data: fileData });
          }}
          onSwitchTo={(type, url) => switchToView(type, url)}
          initialUrl={currentUrl}
        />
      );
    }

    if (activeView === "audio") {
      if (!conversationId) {
        return (
          <div className="p-3 text-xs text-muted-foreground">
            Open a conversation to use Voice Pad.
          </div>
        );
      }
      return (
        <AudioResourcePicker
          conversationId={conversationId}
          onBack={goBack}
          onSelect={(audioData) => {
            void selectOne(audioData);
          }}
        />
      );
    }

    if (activeView === "context_values") {
      return (
        <ContextValuesResourcePicker
          onBack={goBack}
          onSelect={(resource) => void selectOne(resource)}
        />
      );
    }

    if (activeView === "connections" && conversationId) {
      return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <ResourcePickerSubViewHeader title="Connections" onBack={goBack} />
          <ComposerConnectorsPanel conversationId={conversationId} onNavigate={onClose} />
        </div>
      );
    }

    if (activeView === "tools" && conversationId) {
      return (
        <ToolsResourcePicker
          conversationId={conversationId}
          onBack={goBack}
        />
      );
    }

    if (activeView === "skills" && conversationId) {
      return (
        <SkillsResourcePicker
          conversationId={conversationId}
          onBack={goBack}
        />
      );
    }

    // Placeholder views
    const currentResource = menuItems.find((r) => r.id === activeView);

    return (
      <div className="flex flex-col">
        <ResourcePickerSubViewHeader
          title={currentResource?.label ?? "Resource"}
          onBack={goBack}
        />
        <div className="py-8 text-center text-xs text-muted-foreground">
          Coming soon…
        </div>
      </div>
    );
  }

  // Main menu view — the primary doors as a big-icon tile row (the same
  // tiles as ResourcePickerTiles, same item list and tints), everything else
  // as roomy rows with a tinted icon chip.
  const openDoor = (id: Exclude<ResourcePickerViewId, null>) => {
    // "Cloud browser" is a direct action (give the agent a browser → open
    // the canvas), not a drill-in picker view.
    if (id === "cloud_browser") {
      openCloudBrowser({ conversationId });
      onClose();
      return;
    }
    setActiveView(id);
  };
  const [primary, ...rest] = visibleCategories;
  const tileCategory = primary && !primary.category ? primary : null;
  const rowCategories = tileCategory ? rest : visibleCategories;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1 p-1.5 sm:min-w-[22rem]",
        fillHost && "h-full overflow-y-auto",
      )}
    >
      <button
        type="button"
        data-testid="picker-knowledge-search"
        className="flex h-11 w-full shrink-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/70 lg:h-10"
        onClick={openKnowledgeSearch}
      >
        <Search className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">Search your knowledge</span>
        <kbd className="shrink-0 rounded border border-border bg-background px-1 font-sans text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {tileCategory ? (
        <ResourcePickerTiles
          size="compact"
          className="mt-0.5"
          items={resourcePickerItemsAsTiles(tileCategory.items)}
          badges={counts}
          onSelect={(item) => openDoor(item.id as Exclude<ResourcePickerViewId, null>)}
        />
      ) : null}

      {rowCategories.map((category) => (
        <div key={category.category || "primary"} className="flex flex-col">
          {category.category ? (
            <div className="truncate px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {category.category}
            </div>
          ) : null}
          {category.items.map((resource) => (
            <PickerMenuRow
              key={resource.id}
              icon={resource.icon}
              iconClassName={resource.iconClassName}
              label={resource.label}
              count={counts[resource.id]}
              chevron
              onClick={() => openDoor(resource.id)}
            />
          ))}
        </div>
      ))}

      {(onSettingsClick || onDebugClick) && (
        <div className="mt-1 flex flex-col border-t border-border pt-1">
          {onSettingsClick && (
            <PickerMenuRow
              icon={Settings2}
              iconClassName="text-muted-foreground"
              label="Settings"
              onClick={() => {
                onSettingsClick();
                onClose();
              }}
            />
          )}
          {onDebugClick && (
            <PickerMenuRow
              icon={Bug}
              iconClassName={showDebugActive ? "text-destructive" : "text-muted-foreground"}
              label="Debug"
              destructive={showDebugActive}
              onClick={() => {
                onDebugClick();
                onClose();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One menu row: tinted icon chip, one-line label, optional count + chevron. */
function PickerMenuRow({
  icon: Icon,
  iconClassName,
  label,
  count,
  chevron,
  destructive,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  label: string;
  count?: number;
  chevron?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-11 w-full min-w-0 shrink-0 items-center gap-2.5 rounded-lg px-1.5 text-left text-sm transition-colors hover:bg-accent lg:h-9"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className={cn("h-4 w-4", iconClassName)} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          destructive ? "text-destructive" : "text-foreground",
        )}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          className="shrink-0 rounded-md bg-muted px-1.5 text-[11px] leading-5 tabular-nums text-muted-foreground"
          title={`${count} active for this run`}
        >
          {/* read-gate-exempt: useRunControlCounts withholds the count (undefined) until the agent definition has loaded, so a failed load renders no number */}
          {count}
        </span>
      )}
      {chevron ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
      ) : null}
    </button>
  );
}
