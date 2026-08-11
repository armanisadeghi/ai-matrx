"use client";

import React, { useState } from "react";
import { ChevronRight, FolderOpen, Settings2, Bug } from "lucide-react";
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
import {
  ConversationReferencePicker,
  formatConversationReference,
} from "./ConversationReferencePicker";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  flattenResourcePickerItems,
  getVisibleResourcePickerCategories,
  type ResourcePickerViewId,
} from "./resource-picker-menu-items";
import { useRunControlCounts } from "./useRunControlCounts";

interface ResourcePickerMenuProps {
  onResourceSelected(
    resource: unknown,
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
}

export function ResourcePickerMenu({
  onResourceSelected,
  onClose,
  conversationId,
  attachmentCapabilities,
  onSettingsClick,
  onDebugClick,
  showDebugActive,
  allowedViewIds,
}: ResourcePickerMenuProps) {
  const [activeView, setActiveView] = useState<ResourcePickerViewId>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");
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
  const selectOne = async (resource: unknown) => {
    const selected = await onResourceSelected(resource);
    if (selected !== false) onClose();
    return selected;
  };

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
              onSelect={async (files) => {
                // Preserve selection order and wait for every durable edge
                // before any host is allowed to dismiss the picker.
                let completed = true;
                for (const file of files) {
                  const selected = await onResourceSelected({
                    type: "file",
                    data: file,
                  });
                  if (selected === false) {
                    completed = false;
                    break;
                  }
                }
                if (completed) onClose();
              }}
            />
          }
          onBack={() => setActiveView(null)}
          onSelect={async (selection) => {
            await selectOne({ type: "file", data: selection });
          }}
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
          onBack={() => setActiveView(null)}
          onSelect={(conversation) => {
            // A reference is TEXT, not an attachment: the agent reads the id
            // out of the message. Written with the SAME action the user's own
            // keystrokes dispatch, so undo / draft protection / send behave
            // identically (mirrors ChatRoomClient's `input_draft` handler).
            const current =
              selectUserInputText(conversationId)(store.getState()) ?? "";
            const mention = formatConversationReference(conversation);
            const next = current.trim()
              ? `${current.trimEnd()} ${mention}`
              : mention;
            dispatch(setUserInputText({ conversationId, text: next }));
            onClose();
          }}
        />
      );
    }

    if (activeView === "notes") {
      return (
        <NotesResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(note) => {
            void selectOne({ type: "note", data: note });
          }}
        />
      );
    }

    if (activeView === "tasks") {
      return (
        <TasksResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(selection) => {
            void selectOne(selection);
          }}
        />
      );
    }

    if (activeView === "workbooks") {
      return (
        <WorkbooksResourcePicker
          onBack={() => setActiveView(null)}
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
          onBack={() => setActiveView(null)}
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
          onBack={() => setActiveView(null)}
          onSelect={(reference) => {
            void selectOne({ type: "table", data: reference });
          }}
        />
      );
    }

    if (activeView === "webpage") {
      return (
        <WebpageResourcePicker
          onBack={() => setActiveView(null)}
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
          onBack={() => setActiveView(null)}
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
          onBack={() => setActiveView(null)}
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
          onBack={() => setActiveView(null)}
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
          onBack={() => setActiveView(null)}
          onSelect={(audioData) => {
            void selectOne(audioData);
          }}
        />
      );
    }

    if (activeView === "context_values") {
      return (
        <ContextValuesResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(resource) => void selectOne(resource)}
        />
      );
    }

    if (activeView === "tools" && conversationId) {
      return (
        <ToolsResourcePicker
          conversationId={conversationId}
          onBack={() => setActiveView(null)}
        />
      );
    }

    if (activeView === "skills" && conversationId) {
      return (
        <SkillsResourcePicker
          conversationId={conversationId}
          onBack={() => setActiveView(null)}
        />
      );
    }

    // Placeholder views
    const currentResource = menuItems.find((r) => r.id === activeView);

    return (
      <div className="flex flex-col">
        <ResourcePickerSubViewHeader
          title={currentResource?.label ?? "Resource"}
          onBack={() => setActiveView(null)}
        />
        <div className="py-8 text-center text-xs text-muted-foreground">
          Coming soon…
        </div>
      </div>
    );
  }

  // Main menu view
  return (
    <div className="py-1">
      {visibleCategories.map((category) => (
        <div key={category.category}>
          <div className="mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {category.category}
          </div>
          {category.items.map((resource) => {
            const Icon = resource.icon;
            const count = counts[resource.id];
            return (
              <Button
                key={resource.id}
                variant="ghost"
                size="sm"
                className="group h-6 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60"
                onClick={() => setActiveView(resource.id)}
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
              className="h-6 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60"
              onClick={() => {
                onSettingsClick();
                onClose();
              }}
            >
              <Settings2 className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-foreground font-normal">
                Settings
              </span>
            </Button>
          )}
          {onDebugClick && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted/60"
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
