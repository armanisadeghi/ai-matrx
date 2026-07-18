import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  Cpu,
  File,
  FileText,
  Globe,
  Image,
  Layers,
  Lightbulb,
  Mic,
  Notebook,
  Settings2,
  StickyNote,
  Table2,
  Upload,
  Wrench,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";

export type ResourcePickerViewId =
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
  | "context_values"
  | "tools"
  | "skills"
  | "run_settings"
  | "run_model"
  | null;

export type ResourcePickerMenuItem = {
  id: Exclude<ResourcePickerViewId, null>;
  label: string;
  icon: LucideIcon | typeof Youtube;
  /** Tailwind classes on the menu row icon — module / brand tint. */
  iconClassName: string;
  requiresCapability:
    | null
    | "supportsImageUrls"
    | "supportsFileUrls"
    | "supportsYoutubeVideos"
    | "supportsAudio";
  /** Hidden when no conversation id (run-control pickers). */
  requiresConversation?: boolean;
};

export type ResourcePickerMenuCategory = {
  category: string;
  items: ResourcePickerMenuItem[];
};

/** Canonical attach-menu order — MATRX, web ingress, then this-run controls. */
export const RESOURCE_PICKER_MENU_CATEGORIES: ResourcePickerMenuCategory[] = [
  {
    category: "MATRX",
    items: [
      {
        id: "storage",
        label: "Stored Files",
        icon: FileText,
        iconClassName: "text-blue-600 dark:text-blue-400",
        requiresCapability: null,
      },
      {
        id: "tables",
        label: "Tables",
        icon: Table2,
        iconClassName: "text-green-600 dark:text-green-400",
        requiresCapability: null,
      },
      {
        id: "notes",
        label: "Notes",
        icon: StickyNote,
        iconClassName: "text-yellow-600 dark:text-yellow-400",
        requiresCapability: null,
      },
      {
        id: "tasks",
        label: "Tasks",
        icon: CheckSquare,
        iconClassName: "text-blue-600 dark:text-blue-400",
        requiresCapability: null,
      },
      {
        id: "workbooks",
        label: "Workbooks",
        icon: Notebook,
        iconClassName: "text-violet-600 dark:text-violet-400",
        requiresCapability: null,
      },
      {
        id: "documents",
        label: "Documents",
        icon: FileText,
        iconClassName: "text-indigo-600 dark:text-indigo-400",
        requiresCapability: null,
      },
      {
        id: "context_values",
        label: "Context Values",
        icon: Layers,
        iconClassName: "text-secondary dark:text-secondary",
        requiresCapability: null,
      },
    ],
  },
  {
    category: "From the web",
    items: [
      {
        id: "upload",
        label: "Upload Files",
        icon: Upload,
        iconClassName: "text-primary",
        requiresCapability: null,
      },
      {
        id: "webpage",
        label: "Webpage",
        icon: Globe,
        iconClassName: "text-teal-600 dark:text-teal-400",
        requiresCapability: null,
      },
      {
        id: "image_url",
        label: "Image URL",
        icon: Image,
        iconClassName: "text-sky-600 dark:text-sky-400",
        requiresCapability: "supportsImageUrls",
      },
      {
        id: "file_url",
        label: "File URL",
        icon: File,
        iconClassName: "text-purple-600 dark:text-purple-400",
        requiresCapability: "supportsFileUrls",
      },
      {
        id: "youtube",
        label: "YouTube",
        icon: Youtube,
        iconClassName: "text-red-600 dark:text-red-400",
        requiresCapability: "supportsYoutubeVideos",
      },
      {
        id: "audio",
        label: "Audio",
        icon: Mic,
        iconClassName: "text-pink-600 dark:text-pink-400",
        requiresCapability: "supportsAudio",
      },
    ],
  },
  {
    category: "This run",
    items: [
      {
        id: "tools",
        label: "Tools",
        icon: Wrench,
        iconClassName: "text-amber-600 dark:text-amber-400",
        requiresCapability: null,
        requiresConversation: true,
      },
      {
        id: "skills",
        label: "Skills",
        icon: Lightbulb,
        iconClassName: "text-yellow-600 dark:text-yellow-400",
        requiresCapability: null,
        requiresConversation: true,
      },
      {
        id: "run_settings",
        label: "Settings",
        icon: Settings2,
        iconClassName: "text-muted-foreground",
        requiresCapability: null,
        requiresConversation: true,
      },
      {
        id: "run_model",
        label: "Model",
        icon: Cpu,
        iconClassName: "text-primary",
        requiresCapability: null,
        requiresConversation: true,
      },
    ],
  },
];

export function flattenResourcePickerItems(): ResourcePickerMenuItem[] {
  return RESOURCE_PICKER_MENU_CATEGORIES.flatMap((cat) => cat.items);
}

export type ResourcePickerAttachmentCapabilities = {
  supportsImageUrls?: boolean;
  supportsFileUrls?: boolean;
  supportsYoutubeVideos?: boolean;
  supportsAudio?: boolean;
};

export type ResourcePickerMenuOptions = {
  conversationId?: string;
};

/** True when the item should appear in the attach menu for this model/surface. */
export function isResourcePickerItemAvailable(
  item: ResourcePickerMenuItem,
  capabilities?: ResourcePickerAttachmentCapabilities,
  options?: ResourcePickerMenuOptions,
): boolean {
  if (item.requiresConversation && !options?.conversationId) return false;
  if (!item.requiresCapability) return true;
  return capabilities?.[item.requiresCapability] === true;
}

/** Categories with capability-gated rows removed; empty categories dropped. */
export function getVisibleResourcePickerCategories(
  capabilities?: ResourcePickerAttachmentCapabilities,
  options?: ResourcePickerMenuOptions,
): ResourcePickerMenuCategory[] {
  return RESOURCE_PICKER_MENU_CATEGORIES.map((category) => ({
    ...category,
    items: category.items.filter((item) =>
      isResourcePickerItemAvailable(item, capabilities, options),
    ),
  })).filter((category) => category.items.length > 0);
}
