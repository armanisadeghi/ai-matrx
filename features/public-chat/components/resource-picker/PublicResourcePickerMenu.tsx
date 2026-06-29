"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  FileText,
  StickyNote,
  CheckSquare,
  Table2,
  Globe,
  ChevronLeft,
  ChevronRight,
  Upload,
  Image,
  File,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { AuthGateDialog } from "@/components/dialogs/AuthGateDialog";
import type { PublicResource } from "../../types/content";
import { promptsResourceToPublicResource } from "../../types/content";
import { PublicUploadResourcePicker } from "./PublicUploadResourcePicker";
import { PublicImageUrlPicker } from "./PublicImageUrlPicker";
import { PublicFileUrlPicker } from "./PublicFileUrlPicker";
import { PublicYouTubePicker } from "./PublicYouTubePicker";
import { PublicWebpagePicker } from "./PublicWebpagePicker";

// Dynamically import auth-gated pickers — only loaded when authenticated user opens them
const NotesResourcePicker = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/NotesResourcePicker").then(
      (m) => ({ default: m.NotesResourcePicker }),
    ),
  { ssr: false },
);
const TasksResourcePicker = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/TasksResourcePicker").then(
      (m) => ({ default: m.TasksResourcePicker }),
    ),
  { ssr: false },
);
const TablesResourcePicker = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/TablesResourcePicker").then(
      (m) => ({ default: m.TablesResourcePicker }),
    ),
  { ssr: false },
);
const FilesResourcePicker = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/FilesResourcePicker").then(
      (m) => ({ default: m.FilesResourcePicker }),
    ),
  { ssr: false },
);

type ResourceView =
  | "upload"
  | "storage"
  | "notes"
  | "tasks"
  | "tables"
  | "webpage"
  | "youtube"
  | "image_url"
  | "file_url"
  | null;

interface PublicResourcePickerMenuProps {
  onResourceSelected: (resource: PublicResource) => void;
  onClose: () => void;
  isAuthenticated?: boolean;
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
  };
}

interface ResourceItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresAuth: boolean;
  capability?: keyof NonNullable<
    PublicResourcePickerMenuProps["attachmentCapabilities"]
  >;
  featureName?: string;
  featureDescription?: string;
}

interface ResourceCategory {
  category: string;
  items: ResourceItem[];
}

export function PublicResourcePickerMenu({
  onResourceSelected,
  onClose,
  isAuthenticated = false,
  attachmentCapabilities,
}: PublicResourcePickerMenuProps) {
  const [activeView, setActiveView] = useState<ResourceView>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState<{
    name: string;
    description: string;
  }>({
    name: "",
    description: "",
  });

  const switchToView = (view: ResourceView, url: string) => {
    setCurrentUrl(url);
    setActiveView(view);
  };

  const handleItemClick = (item: ResourceItem) => {
    if (item.requiresAuth && !isAuthenticated) {
      setAuthGateFeature({
        name: item.featureName ?? item.label,
        description:
          item.featureDescription ??
          `Sign in to use ${item.label} as a resource.`,
      });
      setAuthGateOpen(true);
      return;
    }
    setActiveView(item.id as ResourceView);
  };

  const handleResourceSelected = (resource: PublicResource) => {
    onResourceSelected(resource);
    onClose();
  };

  // Adapter: prompts pickers return their own Resource shape; we normalise it.
  const handlePromptsResource = (resource: {
    type: string;
    data: Record<string, unknown>;
  }) => {
    handleResourceSelected(promptsResourceToPublicResource(resource));
  };

  const resourceCategories: ResourceCategory[] = [
    {
      category: "Files",
      items: [
        {
          id: "upload",
          label: "Upload Files",
          icon: Upload,
          requiresAuth: false,
        },
        {
          id: "storage",
          label: "Stored Files",
          icon: FileText,
          requiresAuth: true,
          featureName: "Stored Files",
          featureDescription:
            "Browse and attach files from your Matrx storage.",
        },
      ],
    },
    {
      category: "Web",
      items: [
        { id: "webpage", label: "Webpage", icon: Globe, requiresAuth: false },
        {
          id: "image_url",
          label: "Image URL",
          icon: Image,
          requiresAuth: false,
          capability: "supportsImageUrls",
        },
        {
          id: "file_url",
          label: "File URL",
          icon: File,
          requiresAuth: false,
          capability: "supportsFileUrls",
        },
        {
          id: "youtube",
          label: "YouTube",
          icon: Youtube,
          requiresAuth: false,
          capability: "supportsYoutubeVideos",
        },
      ],
    },
    {
      category: "Matrx",
      items: [
        {
          id: "tables",
          label: "Tables",
          icon: Table2,
          requiresAuth: true,
          featureName: "Tables",
          featureDescription: "Attach data tables from your Matrx workspace.",
        },
        {
          id: "notes",
          label: "Notes",
          icon: StickyNote,
          requiresAuth: true,
          featureName: "Notes",
          featureDescription: "Attach notes from your Matrx workspace.",
        },
        {
          id: "tasks",
          label: "Tasks",
          icon: CheckSquare,
          requiresAuth: true,
          featureName: "Tasks",
          featureDescription:
            "Attach tasks or projects from your Matrx workspace.",
        },
      ],
    },
  ];

  // Whether a capability-gated item is enabled (null capability = always enabled)
  const isCapabilityEnabled = (item: ResourceItem) => {
    if (!item.capability) return true;
    if (!attachmentCapabilities) return true; // no caps config = show all
    return attachmentCapabilities[item.capability] !== false;
  };

  // ── Sub-picker views ──────────────────────────────────────────────────

  if (activeView === "upload") {
    return (
      <PublicUploadResourcePicker
        onBack={() => setActiveView(null)}
        onSelect={(files) => files.forEach((f) => handleResourceSelected(f))}
      />
    );
  }

  if (activeView === "image_url") {
    return (
      <PublicImageUrlPicker
        onBack={() => setActiveView(null)}
        onSelect={(imageData) => handleResourceSelected(imageData)}
        onSwitchTo={(type, url) => switchToView(type as ResourceView, url)}
        initialUrl={currentUrl}
      />
    );
  }

  if (activeView === "file_url") {
    return (
      <PublicFileUrlPicker
        onBack={() => setActiveView(null)}
        onSelect={(fileData) => handleResourceSelected(fileData)}
        onSwitchTo={(type, url) => switchToView(type as ResourceView, url)}
        initialUrl={currentUrl}
      />
    );
  }

  if (activeView === "youtube") {
    return (
      <PublicYouTubePicker
        onBack={() => setActiveView(null)}
        onSelect={(videoData) => handleResourceSelected(videoData)}
        initialUrl={currentUrl}
      />
    );
  }

  if (activeView === "webpage") {
    return (
      <PublicWebpagePicker
        onBack={() => setActiveView(null)}
        onSelect={(webpageData) => handleResourceSelected(webpageData)}
        onSwitchTo={(type, url) => switchToView(type as ResourceView, url)}
        initialUrl={currentUrl}
      />
    );
  }

  // Auth-gated pickers — reused from prompts feature via dynamic import
  if (activeView === "notes") {
    return (
      <NotesResourcePicker
        onBack={() => setActiveView(null)}
        onSelect={(note) =>
          handlePromptsResource({
            type: "note",
            data: note as unknown as Record<string, unknown>,
          })
        }
      />
    );
  }

  if (activeView === "tasks") {
    return (
      <TasksResourcePicker
        onBack={() => setActiveView(null)}
        onSelect={(selection) =>
          handlePromptsResource({
            type: selection.type,
            data: selection.data as unknown as Record<string, unknown>,
          })
        }
      />
    );
  }

  if (activeView === "tables") {
    return (
      <TablesResourcePicker
        onBack={() => setActiveView(null)}
        onSelect={(reference) =>
          handlePromptsResource({
            type: "table",
            data: reference as unknown as Record<string, unknown>,
          })
        }
      />
    );
  }

  if (activeView === "storage") {
    return (
      <FilesResourcePicker
        onBack={() => setActiveView(null)}
        onSelect={(selection) =>
          handlePromptsResource({
            type: "storage",
            data: selection as unknown as Record<string, unknown>,
          })
        }
      />
    );
  }

  // ── Main menu ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="py-1">
        {resourceCategories.map((category) => (
          <div key={category.category}>
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5 mt-1">
              {category.category}
            </div>
            {category.items.map((resource) => {
              const Icon = resource.icon;
              const capEnabled = isCapabilityEnabled(resource);
              const needsAuth = resource.requiresAuth && !isAuthenticated;
              const isEnabled = capEnabled;

              return (
                <Button
                  key={resource.id}
                  variant="ghost"
                  size="sm"
                  disabled={!capEnabled}
                  className="group w-full justify-start h-6 text-xs px-2 py-0 hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
                  onClick={() => isEnabled && handleItemClick(resource)}
                  title={
                    !capEnabled
                      ? "Not supported by current model"
                      : needsAuth
                        ? "Sign in required"
                        : undefined
                  }
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                  <span className="text-gray-900 dark:text-gray-100 font-normal">
                    {resource.label}
                  </span>
                  {needsAuth && (
                    <span className="ml-2 text-[8px] px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                      Sign in
                    </span>
                  )}
                  {!capEnabled && (
                    <span className="ml-2 text-[8px] px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                      N/A
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0 text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors" />
                </Button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Auth gate dialog — shown when unauthenticated user clicks a restricted item */}
      <AuthGateDialog
        isOpen={authGateOpen}
        onClose={() => setAuthGateOpen(false)}
        featureName={authGateFeature.name}
        featureDescription={authGateFeature.description}
      />
    </>
  );
}
