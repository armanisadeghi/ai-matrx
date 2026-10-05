/**
 * THE one registry of the Source input's "Add new" tiles — the doors that
 * turn NEW material into a Source. Each entry names the EXISTING door it uses:
 *
 *   upload / image → `InlineUploadArea` (the resource picker's canonical
 *                    upload surface: compression, folder drops, Google
 *                    import; image also takes an image link)
 *                    → `useSourceIntake().addUploaded`.
 *   recording      → `AudioResourcePicker` (Voice Pad, records in place) →
 *                    its transcript lands as text; "Upload a recording" →
 *                    `InlineUploadArea` → `addUploadedRecording`.
 *   paste          → `POST /sources/land`.
 *   web page       → `WebpageResourcePickerCore` (`onReadUrl`) → `addWebPage`;
 *                    the scraper lands the page at its result boundary.
 *   YouTube        → `YouTubeResourcePicker` → the transcript door.
 *   topic          → the set's topic.
 *
 * "Use existing" is NOT here: it is the registry's `source_input_pickable`
 * kinds with live counts (`useKindCounts` / `useKindItems`, lane A5-P).
 *
 * Copy law (R9): a tile is a noun — no helper line, nothing that wraps.
 * Label, icon and tint come from the canonical association items
 * (`RESOURCE_PICKER_SOURCE_ITEMS`) and render through `ResourcePickerTiles`.
 * Hosts narrow the tiles with the `kinds` prop — never by forking this list.
 */

import type { ComponentType } from "react";
import { FileText, Library, StickyNote } from "lucide-react";
import { RESOURCE_PICKER_SOURCE_ITEMS } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  SOURCE_KIND_LABEL,
  sourceKindGroup,
} from "@/features/sources/sourceRows";
import type { SourceDraft, SourceKindId, SourceTileId } from "@ai-matrx/agents/sources/runtime";

export type SourceKindControl = "upload" | "paste" | "url" | "youtube" | "audio" | "topic";

export interface SourceKindDef {
  id: Exclude<SourceTileId, "existing">;
  /** The tile's one word or two. */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Module / brand tint on the icon (canonical item). */
  iconClassName: string;
  control: SourceKindControl;
  /** Upload tiles: what the chooser and the drop accept. */
  accept?: string;
  /** What a Source added through this tile IS, as a noun ("Web page", "Transcript"). */
  noun: string;
}

const door = (id: Exclude<SourceTileId, "existing">) => {
  const { label, icon, iconClassName } = RESOURCE_PICKER_SOURCE_ITEMS[id];
  return { id, label, icon, iconClassName };
};

export const SOURCE_KINDS: readonly SourceKindDef[] = [
  {
    ...door("upload"),
    noun: "File",
    control: "upload",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.html,.json",
  },
  { ...door("paste"), noun: "Pasted text", control: "paste" },
  { ...door("web"), noun: "Web page", control: "url" },
  { ...door("youtube"), noun: "YouTube video", control: "youtube" },
  { ...door("audio"), noun: "Recording", control: "audio", accept: "audio/*,video/*" },
  { ...door("image"), noun: "Image", control: "upload", accept: "image/*" },
  { ...door("topic"), noun: "Topic", control: "topic" },
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
