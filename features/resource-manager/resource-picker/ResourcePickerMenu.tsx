"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Settings2, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotesResourcePicker } from "./NotesResourcePicker";
import { TasksResourcePicker } from "./TasksResourcePicker";
import { FilesResourcePicker } from "./FilesResourcePicker";
import { TablesResourcePicker } from "./TablesResourcePicker";
import { WebpageResourcePicker } from "./WebpageResourcePicker";
import { UploadResourcePicker } from "./UploadResourcePicker";
import { YouTubeResourcePicker } from "./YouTubeResourcePicker";
import { ImageUrlResourcePicker } from "./ImageUrlResourcePicker";
import { FileUrlResourcePicker } from "./FileUrlResourcePicker";
import { AudioResourcePicker } from "./AudioResourcePicker";
import { WorkbooksResourcePicker } from "./WorkbooksResourcePicker";
import { DocumentsResourcePicker } from "./DocumentsResourcePicker";
import { ContextValuesResourcePicker } from "./ContextValuesResourcePicker";
import { ToolsResourcePicker } from "./ToolsResourcePicker";
import { SkillsResourcePicker } from "./SkillsResourcePicker";
import { RunSettingsResourcePicker } from "./RunSettingsResourcePicker";
import {
  flattenResourcePickerItems,
  getVisibleResourcePickerCategories,
  type ResourcePickerViewId,
} from "./resource-picker-menu-items";

interface ResourcePickerMenuProps {
  onResourceSelected: (resource: any) => void;
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
}

export function ResourcePickerMenu({
  onResourceSelected,
  onClose,
  conversationId,
  attachmentCapabilities,
  onSettingsClick,
  onDebugClick,
  showDebugActive,
}: ResourcePickerMenuProps) {
  const [activeView, setActiveView] = useState<ResourcePickerViewId>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");

  // Helper to switch views and carry over the URL
  const switchToView = (view: ResourcePickerViewId, url: string) => {
    setCurrentUrl(url);
    setActiveView(view);
  };

  const menuItems = flattenResourcePickerItems();
  const visibleCategories = getVisibleResourcePickerCategories(
    attachmentCapabilities,
    { conversationId },
  );

  // Show specific resource picker based on selection
  if (activeView) {
    if (activeView === "upload") {
      return (
        <UploadResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(files) => {
            // Handle multiple files
            files.forEach((file) => {
              onResourceSelected({ type: "file", data: file });
            });
          }}
        />
      );
    }

    if (activeView === "storage") {
      return (
        <FilesResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(selection) => {
            onResourceSelected({ type: "file", data: selection });
          }}
        />
      );
    }

    if (activeView === "notes") {
      return (
        <NotesResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(note) => {
            onResourceSelected({ type: "note", data: note });
          }}
        />
      );
    }

    if (activeView === "tasks") {
      return (
        <TasksResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(selection) => {
            onResourceSelected(selection);
          }}
        />
      );
    }

    if (activeView === "workbooks") {
      return (
        <WorkbooksResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(workbook) => {
            onResourceSelected({
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
            onResourceSelected({
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
            onResourceSelected({ type: "table", data: reference });
          }}
        />
      );
    }

    if (activeView === "webpage") {
      return (
        <WebpageResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(content) => {
            onResourceSelected({ type: "webpage", data: content });
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
            onResourceSelected({ type: "youtube", data: video });
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
            onResourceSelected({ type: "image_url", data: imageData });
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
            onResourceSelected({ type: "file_url", data: fileData });
          }}
          onSwitchTo={(type, url) => switchToView(type, url)}
          initialUrl={currentUrl}
        />
      );
    }

    if (activeView === "audio") {
      return (
        <AudioResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={(audioData) => {
            onResourceSelected({ type: "audio", data: audioData });
          }}
        />
      );
    }

    if (activeView === "context_values") {
      return (
        <ContextValuesResourcePicker
          onBack={() => setActiveView(null)}
          onSelect={onResourceSelected}
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

    if (activeView === "run_settings" && conversationId) {
      return (
        <RunSettingsResourcePicker
          conversationId={conversationId}
          onBack={() => setActiveView(null)}
        />
      );
    }

    // Placeholder views
    const currentResource = menuItems.find((r) => r.id === activeView);

    return (
      <div className="p-3">
        <div className="mb-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setActiveView(null)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground">
            {currentResource?.label}
          </span>
        </div>
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
              <Settings2 className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-gray-600 dark:text-gray-400" />
              <span className="text-gray-900 dark:text-gray-100 font-normal">
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
                className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${showDebugActive ? "text-red-500" : "text-gray-600 dark:text-gray-400"}`}
              />
              <span
                className={
                  showDebugActive
                    ? "text-red-500 font-normal"
                    : "text-gray-900 dark:text-gray-100 font-normal"
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
