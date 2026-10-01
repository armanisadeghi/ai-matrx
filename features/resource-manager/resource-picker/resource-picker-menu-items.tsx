import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  CheckSquare,
  File,
  FileText,
  FolderOpen,
  Globe,
  ClipboardType,
  Image,
  Layers,
  Library,
  Lightbulb,
  MessagesSquare,
  Mic,
  Notebook,
  StickyNote,
  Table2,
  Wrench,
  Plug,
  Upload,
} from "lucide-react";
import { Google, Youtube } from "@/components/icons/brand-icons";

export type ResourcePickerViewId =
  | "cloud_browser"
  | "files"
  | "conversations"
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
  | "google"
  | "context_values"
  | "connections"
  | "tools"
  | "skills"
  | null;

export type ResourcePickerMenuItem = {
  id: Exclude<ResourcePickerViewId, null>;
  label: string;
  icon: LucideIcon | typeof Youtube | typeof Google;
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
  /**
   * Section label above the rows. Empty string = no header (flat top items:
   * Files, Voice Pad, Webpage, Tools, Skills).
   */
  category: string;
  items: ResourcePickerMenuItem[];
};

/**
 * Canonical attach-menu order (Arman 2026-08-11):
 *   1. Flat primary rows (no section header): Files → Voice Pad → Webpage →
 *      Tools → Skills
 *   2. Attach/Associate: MATRX records + URL ingress (image/file/YouTube)
 */
export const RESOURCE_PICKER_MENU_CATEGORIES: ResourcePickerMenuCategory[] = [
  {
    category: "",
    items: [
      {
        id: "files",
        label: "Files",
        icon: FolderOpen,
        iconClassName: "text-primary",
        requiresCapability: null,
      },
      {
        id: "audio",
        label: "Voice Pad",
        icon: Mic,
        iconClassName: "text-pink-600 dark:text-pink-400",
        requiresCapability: "supportsAudio",
        requiresConversation: true,
      },
      {
        id: "webpage",
        label: "Web page",
        icon: Globe,
        iconClassName: "text-teal-600 dark:text-teal-400",
        requiresCapability: null,
      },
      {
        // Always offered, even with nothing connected — a user cannot ask for a
        // capability they do not know exists. The unconnected state is the
        // pitch plus a one-click connect, never an error.
        id: "google",
        label: "Google",
        icon: Google,
        iconClassName: "text-blue-600 dark:text-blue-400",
        requiresCapability: null,
      },
      {
        // Direct ACTION row, not a drill-in picker: hands the agent a private
        // cloud browser (opens the canvas). Ruled by Arman 2026-08-21: the
        // browser entry point lives HERE, never as a standing input-bar button;
        // once a browser is live it shows as a context-rail pill above the input.
        id: "cloud_browser",
        label: "Cloud browser",
        icon: AppWindow,
        iconClassName: "text-sky-600 dark:text-sky-400",
        requiresCapability: null,
      },
      {
        id: "tools",
        label: "Tools",
        icon: Wrench,
        iconClassName: "text-amber-600 dark:text-amber-400",
        requiresCapability: null,
        requiresConversation: true,
      },
      {
        id: "connections",
        label: "Connections",
        icon: Plug,
        iconClassName: "text-primary",
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
    ],
  },
  {
    category: "Attach/Associate",
    items: [
      {
        // Inserts a readable reference ("my conversation …") into the draft —
        // not a resource chip; the agent reads the id from the message text
        // (agent_call history_conversation_id). See ConversationReferencePicker.
        id: "conversations",
        label: "Chats",
        icon: MessagesSquare,
        iconClassName: "text-emerald-600 dark:text-emerald-400",
        requiresCapability: null,
        // The reference is written into THIS conversation's draft — with no
        // conversation there is nowhere to put it, so don't offer the door.
        requiresConversation: true,
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
        label: "Context values",
        icon: Layers,
        iconClassName: "text-secondary dark:text-secondary",
        requiresCapability: null,
      },
      {
        id: "image_url",
        label: "Image link",
        icon: Image,
        iconClassName: "text-sky-600 dark:text-sky-400",
        requiresCapability: "supportsImageUrls",
      },
      {
        id: "file_url",
        label: "File link",
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
  /** Restrict a reused picker to the resource kinds its host can persist. */
  allowedViewIds?: readonly Exclude<ResourcePickerViewId, null>[];
};

/** True when the item should appear in the attach menu for this model/surface. */
export function isResourcePickerItemAvailable(
  item: ResourcePickerMenuItem,
  capabilities?: ResourcePickerAttachmentCapabilities,
  options?: ResourcePickerMenuOptions,
): boolean {
  if (item.requiresConversation && !options?.conversationId) return false;
  if (options?.allowedViewIds && !options.allowedViewIds.includes(item.id)) {
    return false;
  }
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

// ── Association tiles ────────────────────────────────────────────────────────
//
// THE item definitions for every "add a source / attach a resource" door that
// is drawn as a tile grid (ResourcePickerTiles) instead of menu rows. Doors
// that already exist as menu rows reuse that row's icon + tint, so a kind
// looks the same in the attach menu, the tile grid and anywhere else. Doors
// that only exist as tiles (Upload, Paste text, Topic, Use existing) are
// defined here — never in a host. These are NOT menu rows: the attach menu
// keeps exactly one Files door (see resource-picker-menu-items.test.ts).

/** One association door, independent of how it is drawn (row or tile). */
export type ResourcePickerTileItem = {
  id: string;
  label: string;
  icon: ResourcePickerMenuItem["icon"];
  /** Tailwind classes on the icon — module / brand tint. */
  iconClassName: string;
};

export type ResourcePickerSourceItemId =
  | "upload"
  | "paste"
  | "web"
  | "youtube"
  | "audio"
  | "image"
  | "topic"
  | "existing";

function menuItemAsTile(
  viewId: Exclude<ResourcePickerViewId, null>,
  id: ResourcePickerSourceItemId,
  label?: string,
): ResourcePickerTileItem {
  const row = flattenResourcePickerItems().find((item) => item.id === viewId);
  if (!row) throw new Error(`resource-picker-menu-items: no menu row "${viewId}"`);
  return { id, label: label ?? row.label, icon: row.icon, iconClassName: row.iconClassName };
}

/** Source doors (Create deck, Podcast Studio, …) keyed by source tile id. */
export const RESOURCE_PICKER_SOURCE_ITEMS: Record<
  ResourcePickerSourceItemId,
  ResourcePickerTileItem
> = {
  upload: {
    id: "upload",
    label: "Upload",
    icon: Upload,
    iconClassName: "text-primary",
  },
  paste: {
    id: "paste",
    label: "Paste text",
    icon: ClipboardType,
    iconClassName: "text-slate-600 dark:text-slate-300",
  },
  web: menuItemAsTile("webpage", "web"),
  youtube: menuItemAsTile("youtube", "youtube"),
  audio: menuItemAsTile("audio", "audio", "Recording"),
  image: menuItemAsTile("image_url", "image", "Image"),
  topic: {
    id: "topic",
    label: "Topic",
    icon: Lightbulb,
    iconClassName: "text-orange-600 dark:text-orange-400",
  },
  existing: {
    id: "existing",
    label: "Use existing",
    icon: Library,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
};

/** Every menu row as a tile item — the same doors, drawn as a grid. */
export function resourcePickerItemsAsTiles(
  items: readonly ResourcePickerMenuItem[] = flattenResourcePickerItems(),
): ResourcePickerTileItem[] {
  return items.map(({ id, label, icon, iconClassName }) => ({ id, label, icon, iconClassName }));
}
