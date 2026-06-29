"use client";

import React, { useState } from "react";
import {
  FileText,
  StickyNote,
  CheckSquare,
  Table2,
  Globe,
  Workflow,
  ChevronLeft,
  ChevronRight,
  Upload,
  Image,
  File,
  Mic,
  Notebook,
  Settings2,
  Bug,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
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

type ResourceType =
  | "upload"
  | "storage"
  | "notes"
  | "tasks"
  | "workbooks"
  | "documents"
  | "tables"
  | "webpage"
  | "youtube"
  | "image_url"
  | "file_url"
  | "audio"
  | "brokers"
  | null;

interface ResourcePickerMenuProps {
  onResourceSelected: (resource: any) => void;
  onClose: () => void;
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
  attachmentCapabilities,
  onSettingsClick,
  onDebugClick,
  showDebugActive,
}: ResourcePickerMenuProps) {
  const [activeView, setActiveView] = useState<ResourceType>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");

  // Helper to switch views and carry over the URL
  const switchToView = (view: ResourceType, url: string) => {
    setCurrentUrl(url);
    setActiveView(view);
  };

  const resourceCategories = [
    {
      category: "Files",
      items: [
        {
          id: "upload",
          label: "Upload Files",
          icon: Upload,
          requiresCapability: null,
        },
      ],
    },
    {
      category: "Web",
      items: [
        {
          id: "webpage",
          label: "Webpage",
          icon: Globe,
          requiresCapability: null,
        },
        {
          id: "image_url",
          label: "Image URL",
          icon: Image,
          requiresCapability: "supportsImageUrls" as const,
        },
        {
          id: "file_url",
          label: "File URL",
          icon: File,
          requiresCapability: "supportsFileUrls" as const,
        },
        {
          id: "youtube",
          label: "YouTube",
          icon: Youtube,
          requiresCapability: "supportsYoutubeVideos" as const,
        },
      ],
    },
    {
      category: "Matrx",
      items: [
        {
          id: "storage",
          label: "Stored Files",
          icon: FileText,
          requiresCapability: null,
        },
        {
          id: "tables",
          label: "Tables",
          icon: Table2,
          requiresCapability: null,
        },
        {
          id: "notes",
          label: "Notes",
          icon: StickyNote,
          requiresCapability: null,
        },
        {
          id: "tasks",
          label: "Tasks",
          icon: CheckSquare,
          requiresCapability: null,
        },
        {
          id: "workbooks",
          label: "Workbooks",
          icon: Notebook,
          requiresCapability: null,
        },
        {
          id: "documents",
          label: "Documents",
          icon: FileText,
          requiresCapability: null,
        },
        {
          id: "brokers",
          label: "Brokers",
          icon: Workflow,
          requiresCapability: null,
        },
      ],
    },
  ];

  // Check if a resource is enabled based on capabilities
  const isResourceEnabled = (resource: {
    requiresCapability: string | null;
  }) => {
    if (!resource.requiresCapability) return true;
    return (
      attachmentCapabilities?.[
        resource.requiresCapability as keyof typeof attachmentCapabilities
      ] === true
    );
  };

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

    // Add other resource pickers here as they're implemented
    const currentResource = resourceCategories
      .flatMap((cat) => cat.items)
      .find((r) => r.id === activeView);

    return (
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setActiveView(null)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {currentResource?.label}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
          Coming soon...
        </div>
      </div>
    );
  }

  // Main menu view
  return (
    <div className="py-1">
      {resourceCategories.map((category) => (
        <div key={category.category}>
          <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5 mt-1">
            {category.category}
          </div>
          {category.items.map((resource) => {
            const Icon = resource.icon;
            const isEnabled = isResourceEnabled(resource);
            return (
              <Button
                key={resource.id}
                variant="ghost"
                size="sm"
                disabled={!isEnabled}
                className="group w-full justify-start h-6 text-xs px-2 py-0 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-none"
                onClick={() => setActiveView(resource.id as ResourceType)}
                title={
                  !isEnabled ? "Not supported by current model" : undefined
                }
              >
                <Icon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                <span className="text-gray-900 dark:text-gray-100 font-normal">
                  {resource.label}
                </span>
                {!isEnabled && (
                  <span className="ml-2 text-[8px] px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                    N/A
                  </span>
                )}
                <ChevronRight className="w-3 h-3 ml-1.5 flex-shrink-0 text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors" />
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
              className="w-full justify-start h-6 text-xs px-2 py-0 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-none"
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
              className="w-full justify-start h-6 text-xs px-2 py-0 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-none"
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
