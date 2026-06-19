/**
 * Context-item registry — THE single source of truth for "what attachable
 * types exist and how each renders in the detail drawer."
 *
 * Consolidates the historically-duplicated type→{icon,label} switches that
 * lived inline in `AgentUserMessage.normaliseBlock`, `SmartAgentResourceChips`,
 * and the placeholder `BlockModal`. Every chip click now routes through the one
 * shared drawer, which resolves the body via this registry.
 *
 * To give a "somewhat random" type a real custom UI: add (or extend) a
 * `ContextItemTypeDef` here with a dedicated `Body`. Nothing else changes —
 * chips and the drawer pick it up automatically. Unregistered types fall back
 * to `GenericBody` (a readable summary + collapsible raw payload, never a bare
 * JSON dump).
 */

import {
  AlertCircle,
  AudioLines,
  Captions,
  CheckSquare,
  Code2,
  Database,
  File,
  FileText,
  Folder,
  FolderKanban,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Mic,
  Notebook,
  StickyNote,
  Table2,
  Video,
  Webhook,
  Youtube,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ContextItemBodyProps, ContextItemTypeDef } from "./types";
import { NoteBody, NoteFooter } from "./bodies/NoteBody";
import { TaskBody } from "./bodies/TaskBody";
import { WebpageBody, WebpageFooter } from "./bodies/WebpageBody";
import { DataBody } from "./bodies/DataBody";
import { MediaBody, MediaFooter } from "./bodies/MediaBody";
import {
  WorkingDocumentBody,
  WorkingDocumentFooter,
} from "./bodies/WorkingDocumentBody";
import { GenericBody, GenericFooter } from "./bodies/GenericBody";

// ── Defs ─────────────────────────────────────────────────────────────────────

export const CONTEXT_ITEM_TYPE_DEFS: ContextItemTypeDef[] = [
  // Media — real previews via the universal file handler.
  {
    blockTypes: ["image", "image_output"],
    typeLabel: "Image",
    icon: ImageIcon,
    themeKey: "image",
    editable: false,
    Body: MediaBody,
  },
  {
    blockTypes: ["audio", "audio_output"],
    typeLabel: "Audio",
    icon: Mic,
    themeKey: "audio",
    editable: false,
    Body: MediaBody,
  },
  {
    blockTypes: ["video", "video_output"],
    typeLabel: "Video",
    icon: Video,
    themeKey: "video",
    editable: false,
    Body: MediaBody,
  },
  {
    blockTypes: ["document", "file_output"],
    typeLabel: "File",
    icon: File,
    themeKey: "document",
    editable: false,
    Body: MediaBody,
    Footer: MediaFooter,
  },
  {
    blockTypes: ["youtube_video"],
    typeLabel: "YouTube",
    icon: Youtube,
    themeKey: "youtube_video",
    editable: false,
    Body: MediaBody,
  },

  // Editable knowledge records.
  {
    blockTypes: ["input_notes"],
    typeLabel: "Note",
    icon: StickyNote,
    themeKey: "input_notes",
    editable: true,
    Body: NoteBody,
    Footer: NoteFooter,
  },
  {
    blockTypes: ["input_task"],
    typeLabel: "Task",
    icon: CheckSquare,
    themeKey: "input_task",
    editable: true,
    Body: TaskBody,
  },
  {
    // The live, collaborative working document (re-sent every turn — editing
    // it reaches the agent automatically, no re-attach prompt). Reached via the
    // context-slot strip, keyed `working_document`, NOT as a resource block.
    blockTypes: ["working_document"],
    typeLabel: "Working document",
    icon: FileText,
    themeKey: "input_document",
    editable: true,
    Body: WorkingDocumentBody,
    Footer: WorkingDocumentFooter,
  },
  {
    // A reference to a specific rich document by id — distinct from the live
    // working document. GenericBody until a dedicated viewer is wired.
    blockTypes: ["input_document"],
    typeLabel: "Document",
    icon: FileText,
    themeKey: "input_document",
    editable: false,
    Body: GenericBody,
  },

  // Reference previews.
  {
    blockTypes: ["input_webpage"],
    typeLabel: "Webpage",
    icon: Globe,
    themeKey: "input_webpage",
    editable: false,
    Body: WebpageBody,
    Footer: WebpageFooter,
  },
  {
    blockTypes: ["input_data"],
    typeLabel: "Data",
    icon: Database,
    themeKey: "input_data",
    editable: false,
    Body: DataBody,
  },

  // ── Not-yet-custom types — GenericBody for now (extension targets) ──────────
  {
    blockTypes: ["input_table"],
    typeLabel: "Table",
    icon: Table2,
    themeKey: "input_table",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_list"],
    typeLabel: "List",
    icon: List,
    themeKey: "input_list",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_project"],
    typeLabel: "Project",
    icon: Folder,
    themeKey: "input_project",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_agent"],
    typeLabel: "Agent",
    icon: Webhook,
    themeKey: "input_agent",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_agent_app"],
    typeLabel: "App",
    icon: LayoutGrid,
    themeKey: "input_agent_app",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_transcript"],
    typeLabel: "Transcript",
    icon: Captions,
    themeKey: "input_transcript",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_transcript_session"],
    typeLabel: "Session",
    icon: AudioLines,
    themeKey: "input_transcript_session",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["input_workbook"],
    typeLabel: "Workbook",
    icon: Notebook,
    themeKey: "input_workbook",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["text"],
    typeLabel: "Text",
    icon: FileText,
    themeKey: "text",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["editor_error"],
    typeLabel: "Error",
    icon: AlertCircle,
    themeKey: "editor_error",
    editable: false,
    Body: GenericBody,
  },
  {
    blockTypes: ["editor_code_snippet"],
    typeLabel: "Code",
    icon: Code2,
    themeKey: "editor_code_snippet",
    editable: false,
    Body: GenericBody,
  },
];

// ── Index ──────────────────────────────────────────────────────────────────

const BY_BLOCK_TYPE = new Map<string, ContextItemTypeDef>();
for (const def of CONTEXT_ITEM_TYPE_DEFS) {
  for (const t of def.blockTypes) BY_BLOCK_TYPE.set(t, def);
}

const FALLBACK_DEF: ContextItemTypeDef = {
  blockTypes: [],
  typeLabel: "Attachment",
  icon: FolderKanban,
  themeKey: "text",
  editable: false,
  Body: GenericBody,
};

/** Resolve the registered def for a block type, or a graceful fallback. */
export function resolveContextItemDef(blockType: string): ContextItemTypeDef {
  return BY_BLOCK_TYPE.get(blockType) ?? FALLBACK_DEF;
}

/** The body component for a block type (always defined). */
export function resolveContextItemBody(
  blockType: string,
): ComponentType<ContextItemBodyProps> {
  return resolveContextItemDef(blockType).Body;
}

/**
 * The footer component for a block type, or undefined when the type has none.
 * GenericBody-backed types fall back to GenericFooter (the "n projects · …" /
 * "no preview yet" line) without each needing to declare it.
 */
export function resolveContextItemFooter(
  blockType: string,
): ComponentType<ContextItemBodyProps> | undefined {
  const def = resolveContextItemDef(blockType);
  if (def.Footer) return def.Footer;
  if (def.Body === GenericBody) return GenericFooter;
  return undefined;
}
