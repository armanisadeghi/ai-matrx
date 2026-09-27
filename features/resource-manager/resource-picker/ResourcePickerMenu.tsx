"use client";

import React, { useState } from "react";
import { ChevronRight, FolderOpen, Settings2, Bug, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ToolsResourcePicker } from "./ToolsResourcePicker";
import { SkillsResourcePicker } from "./SkillsResourcePicker";
import { ConversationReferencePicker } from "./ConversationReferencePicker";
import { appendConversationReference } from "./conversation-reference-context";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";
import { toast } from "@/lib/toast";
import type { GoogleWorkspaceResourceType } from "@/features/google-workspace/resource-types";
import { GoogleResourcePicker } from "./GoogleResourcePicker";
import { useOpenCloudBrowserCanvas } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { setContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  GOOGLE_FILES_CONTEXT_KEY,
  EMPTY_GOOGLE_FILE_IDS,
  selectGoogleFileIds,
} from "@/features/google-workspace/attach/googleFileContext";
import { useAppDispatch, useAppStore, useAppSelector } from "@/lib/redux/hooks";
import {
  flattenResourcePickerItems,
  getVisibleResourcePickerCategories,
  type ResourcePickerViewId,
} from "./resource-picker-menu-items";
import { useRunControlCounts } from "./useRunControlCounts";
import type { Resource } from "@/features/agents/resources/types";
import { useOpenKnowledgeCommandBar } from "@/features/overlays/openers/knowledgeCommandBar";
import { useOpenResourcePickerWindow } from "@/features/overlays/openers/resourcePickerWindow";
import { useKnowledgeAttachTarget } from "@/features/knowledge/command-bar/useKnowledgeAttachTarget";
import type { KnowledgeCommand } from "@/features/knowledge/command-bar/commands";
import type { LucideIcon } from "lucide-react";

/**
 * The search steps the ⌘K bar replaces: a person looking for one of THEIR
 * notes, chats, files or documents searches for it there (one search over
 * everything). Each is also a hit kind the bar can attach here.
 */
const KNOWLEDGE_ATTACH_VIEW_FOR_ENTITY: Record<string, Exclude<ResourcePickerViewId, null>> = {
  note: "notes",
  conversation: "conversations",
  file: "files",
  processed_document: "files",
};

/** Views that are not a search: capture, URL entry, voice, run toggles. They
 *  stay their own commands in the bar (Raycast: commands beside results). */
const COMMAND_VIEW_IDS: ReadonlySet<Exclude<ResourcePickerViewId, null>> = new Set([
  "files",
  "webpage",
  "youtube",
  "image_url",
  "file_url",
  "audio",
  "google",
  "tables",
  "context_values",
  "tools",
  "skills",
]);


interface ResourcePickerMenuProps {
  onResourceSelected(
    resource: Resource,
  ): boolean | void | Promise<boolean | void>;
  onResourceDeselected?(
    resource: Resource,
  ): boolean | void | Promise<boolean | void>;
  onClose: () => void;
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
}

export function ResourcePickerMenu({
  onResourceSelected,
  onResourceDeselected,
  onClose,
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
}: ResourcePickerMenuProps) {
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
  const counts = useRunControlCounts(conversationId);

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
  const visibleViewIds = new Set(
    visibleCategories.flatMap((c) => c.items.map((i) => i.id)),
  );

  // The search step hands off to ⌘K: one search over everything, with
  // "Attach to this chat" as the primary action for this composer.
  const openKnowledgeBar = useOpenKnowledgeCommandBar();
  const openPickerWindow = useOpenResourcePickerWindow();
  const knowledgeAttach = useKnowledgeAttachTarget({
    conversationId,
    onResourceSelected,
    label: "Attach here",
    accepts: (hit) => {
      const view = KNOWLEDGE_ATTACH_VIEW_FOR_ENTITY[hit.entity];
      return Boolean(view && visibleViewIds.has(view));
    },
  });
  const openKnowledgeSearch = () => {
    const reopenAt = (view: Exclude<ResourcePickerViewId, null>) =>
      onReopenAt
        ? onReopenAt(view)
        : openPickerWindow({
            initialView: view,
            onResourceSelected,
            onResourceDeselected,
            conversationId,
            attachmentCapabilities,
            allowedViewIds,
            selectionMode,
          });
    const commands: KnowledgeCommand[] = menuItems
      .filter((item) => COMMAND_VIEW_IDS.has(item.id) && visibleViewIds.has(item.id))
      .map((item) => ({
        id: `picker:${item.id}`,
        label: item.id === "files" ? "Upload or browse files" : item.label,
        group: "Attach",
        icon: item.icon as LucideIcon,
        keywords: ["attach", "add", item.id],
        run: () => reopenAt(item.id),
      }));
    onClose();
    openKnowledgeBar({
      primaryAction: "attach",
      ...(knowledgeAttach ? { attach: knowledgeAttach } : {}),
      commands,
    });
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
    if (selectionMode === "single") onClose();
  };

  const selectResource = async (resource: Resource, listSelection: boolean) => {
    const selected = await onResourceSelected(resource);
    if (selected !== false && (!listSelection || selectionMode === "single")) {
      onClose();
    }
    return selected;
  };

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
        <FilesResourcePicker
          title="Files"
          headerIcon={
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          }
          topSlot={
            <InlineUploadArea
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
                if (completed && selectionMode === "single") onClose();
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
            if (selectionMode === "single") onClose();
          }}
        />
      );
    }

    if (activeView === "notes") {
      return (
        <NotesResourcePicker
          onBack={goBack}
          onSelect={(note) => {
            void selectFromList({ type: "note", data: note });
          }}
        />
      );
    }

    if (activeView === "tasks") {
      return (
        <TasksResourcePicker
          onBack={goBack}
          onSelect={(selection) => {
            void selectFromList(selection);
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
            void selectFromList({
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
            void selectFromList({
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
            void selectFromList({ type: "table", data: reference });
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
          onSelect={(resource) => void selectFromList(resource)}
        />
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

  // Main menu view
  return (
    <div className={cn("py-1", fillHost && "h-full overflow-y-auto")}>
      <Button
        variant="ghost"
        size="sm"
        data-testid="picker-knowledge-search"
        className="group h-11 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60 lg:h-6"
        onClick={openKnowledgeSearch}
      >
        <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="font-normal text-foreground">Search your knowledge…</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">⌘K</span>
      </Button>
      {visibleCategories.map((category) => (
        <div key={category.category || "primary"} className="flex flex-col">
          {category.category ? (
            <div className="mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {category.category}
            </div>
          ) : null}
          {category.items.map((resource) => {
            const Icon = resource.icon;
            const count = counts[resource.id];
            return (
              <Button
                key={resource.id}
                variant="ghost"
                size="sm"
                className="group h-11 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60 lg:h-6"
                onClick={() => {
                  // "Cloud browser" is a direct action (give the agent a
                  // browser → open the canvas), not a drill-in picker view.
                  if (resource.id === "cloud_browser") {
                    openCloudBrowser({ conversationId });
                    onClose();
                    return;
                  }
                  setActiveView(resource.id);
                }}
              >
                <Icon
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5 shrink-0",
                    resource.iconClassName,
                  )}
                />
                <span className="font-normal text-foreground">
                  {resource.label}
                </span>
                {count !== undefined && (
                  <span
                    className="ml-1.5 shrink-0 rounded bg-muted px-1 text-[10px] leading-4 tabular-nums text-muted-foreground"
                    title={`${count} active for this run`}
                  >
                    {/* read-gate-exempt: useRunControlCounts withholds the count (undefined) until the agent definition has loaded, so a failed load renders no number */}
                    {count}
                  </span>
                )}
                <ChevronRight className="ml-1.5 h-3 w-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
              </Button>
            );
          })}
        </div>
      ))}

      {(onSettingsClick || onDebugClick) && (
        <div className="mt-1 border-t border-border pt-0.5">
          {onSettingsClick && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60 lg:h-6"
              onClick={() => {
                onSettingsClick();
                onClose();
              }}
            >
              <Settings2 className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-foreground font-normal">Settings</span>
            </Button>
          )}
          {onDebugClick && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60 lg:h-6"
              onClick={() => {
                onDebugClick();
                onClose();
              }}
            >
              <Bug
                className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${showDebugActive ? "text-destructive" : "text-muted-foreground"}`}
              />
              <span
                className={
                  showDebugActive
                    ? "text-destructive font-normal"
                    : "text-foreground font-normal"
                }
              >
                Debug
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
