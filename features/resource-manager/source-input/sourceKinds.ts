/**
 * THE one registry of the Source input's "Add new" tiles — the doors that
 * turn NEW material into a Source. Each entry names the EXISTING door it uses:
 *
 *   upload / image / recording → `InlineUploadArea` (the resource picker's
 *                    canonical upload surface: compression, folder drops,
 *                    Google import) → `useSourceIntake().addUploaded`.
 *   paste          → `POST /sources/land`.
 *   web page       → `WebpageResourcePickerCore` (scrape, preview, confirm);
 *                    the scraper lands the page at its result boundary.
 *   YouTube        → `YouTubeResourcePicker` → the transcript door.
 *   topic          → the set's topic.
 *
 * "Use existing" is NOT here: it is the registry's `source_input_pickable`
 * kinds with live counts (`useKindCounts` / `useKindItems`, lane A5-P).
 *
 * Copy law (R9): a tile is a noun — no helper line, nothing that wraps.
 * Hosts narrow the tiles with the `kinds` prop — never by forking this list.
 */

import type { ComponentType } from "react";
import {
  ClipboardType,
  FileAudio,
  FileText,
  Globe,
  ImageIcon,
  Library,
  Lightbulb,
  StickyNote,
  Upload,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  SOURCE_KIND_LABEL,
  sourceKindGroup,
} from "@/features/sources/sourceRows";
import type { SourceDraft, SourceKindId, SourceTileId } from "./types";

export type SourceKindControl = "upload" | "paste" | "url" | "youtube" | "audio" | "topic";

export interface SourceKindDef {
  id: Exclude<SourceTileId, "existing">;
  /** The tile's one word or two. */
  label: string;
  icon: ComponentType<{ className?: string }>;
  control: SourceKindControl;
  /** Upload tiles: what the chooser and the drop accept. */
  accept?: string;
  /** What a Source added through this tile IS, as a noun ("Web page", "Transcript"). */
  noun: string;
}

export const SOURCE_KINDS: readonly SourceKindDef[] = [
  {
    id: "upload",
    noun: "File",
    label: "Upload",
    icon: Upload,
    control: "upload",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.html,.json",
  },
  { id: "paste", noun: "Pasted text", label: "Paste text", icon: ClipboardType, control: "paste" },
  { id: "web", noun: "Web page", label: "Web page", icon: Globe, control: "url" },
  { id: "youtube", noun: "YouTube video", label: "YouTube", icon: Youtube, control: "youtube" },
  {
    id: "audio",
    noun: "Recording",
    label: "Recording",
    icon: FileAudio,
    control: "audio",
    accept: "audio/*,video/*",
  },
  { id: "image", noun: "Image", label: "Image", icon: ImageIcon, control: "upload", accept: "image/*" },
  { id: "topic", noun: "Topic", label: "Topic", icon: Lightbulb, control: "topic" },
];

/** Every tile id a host may pass in `kinds` ("existing" = the Use existing row and search). */
export const ALL_SOURCE_KIND_IDS: readonly SourceTileId[] = [
  ...SOURCE_KINDS.map((k) => k.id),
  "existing",
];

/** The Add new tiles a host allows, in registry order. Unknown ids are ignored. */
export function visibleSourceKinds(kinds: readonly SourceKindId[] | undefined): SourceKindDef[] {
  if (!kinds) return [...SOURCE_KINDS];
  const allowed = new Set<string>(kinds);
  return SOURCE_KINDS.filter((k) => allowed.has(k.id));
}

/** True when the host shows what the person already has (the default). */
export function showsExisting(kinds: readonly SourceKindId[] | undefined): boolean {
  return !kinds || kinds.includes("existing");
}

export function sourceKindDef(id: SourceKindId): SourceKindDef | null {
  return SOURCE_KINDS.find((k) => k.id === id) ?? null;
}

/** The draft kind a picked registry item goes by. */
export function draftKindForToken(token: string): SourceKindId {
  if (token === "file") return "files";
  if (token === "note") return "notes";
  if (token === "processed_document") return "your_sources";
  return "records";
}

/** The key a Source goes by across screens: "<resource_type>:<resource_id>". */
export function sourceKey(ref: { resource_type: string; resource_id: string }): string {
  return `${ref.resource_type}:${ref.resource_id}`;
}

const DRAFT_ICONS: Partial<Record<SourceKindId, ComponentType<{ className?: string }>>> = {
  files: FileText,
  notes: StickyNote,
  your_sources: Library,
};

/** The icon on a picked Source's card: its tile's, else its registry kind's. */
export function sourceKindIcon(
  draft: Pick<SourceDraft, "kind" | "ref">,
): ComponentType<{ className?: string }> {
  const def = sourceKindDef(draft.kind);
  if (def) return def.icon;
  if (DRAFT_ICONS[draft.kind]) return DRAFT_ICONS[draft.kind]!;
  const type = draft.ref?.resource_type;
  return (type && tryGetEntityInfo(type)?.Icon) || Library;
}

/**
 * THE noun for one picked Source — its real kind. A reused Source says the kind
 * it was captured as (`draft.sourceKind`); a picked record says its registry
 * label ("Note", "Table", "Workbook").
 */
export function sourceKindNoun(draft: Pick<SourceDraft, "kind" | "ref" | "sourceKind">): string {
  if (draft.sourceKind) return SOURCE_KIND_LABEL[sourceKindGroup(draft.sourceKind)];
  const def = sourceKindDef(draft.kind);
  if (def) return def.noun;
  const type = draft.ref?.resource_type;
  if (type === "processed_document") return "Source";
  const info = type ? tryGetEntityInfo(type) : null;
  return info?.label ?? "Record";
}
