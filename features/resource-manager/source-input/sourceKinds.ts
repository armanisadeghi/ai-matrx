/**
 * THE ONE registry of Source input tiles.
 *
 * Every tile a `<SourceInput>` shows comes from here, and each entry names the
 * EXISTING door it uses — never a new one:
 *
 *   stored things  → the resource picker's own sub-pickers
 *                    (`features/resource-manager/resource-picker/`), rendered
 *                    in place through `ResourcePickerMenu initialView`.
 *   new material   → the landing door (SOURCE-CONVERGENCE §3, amendment A3):
 *                    pasted text → `POST /sources/land`; a web page → the
 *                    scraper route, which lands at its result boundary; a
 *                    file → `useFileUpload().uploadMany` (UploadGuardHost's
 *                    SHA-256 "use the one you already have" check).
 *   no door yet    → YouTube and audio have no landing of their own: the
 *                    transcript is read by Start's readers and then landed
 *                    through `POST /sources/land`. `fallbackNote` says so on
 *                    the tile, in words (amendment A3: never silent).
 *
 * Hosts narrow the tiles with the `kinds` prop — never by forking this list.
 */

import type { ComponentType } from "react";
import {
  ClipboardType,
  FileAudio,
  FileStack,
  FolderOpen,
  Globe,
  ImageIcon,
  Library,
  Lightbulb,
  StickyNote,
  Upload,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import {
  SOURCE_KIND_LABEL,
  sourceKindGroup,
} from "@/features/sources/sourceRows";
import type { SourceDraft, SourceKindId } from "./types";

export type SourceKindControl =
  | "your_sources"
  | "picker"
  | "upload"
  | "paste"
  | "url"
  | "youtube"
  | "audio"
  | "topic";

export interface SourceKindDef {
  id: SourceKindId;
  label: string;
  /** One line under the label — what it does, for someone who has never seen it. */
  helper: string;
  icon: ComponentType<{ className?: string }>;
  control: SourceKindControl;
  /** Stored things: the sub-picker(s) this tile opens. */
  pickerViews?: readonly Exclude<ResourcePickerViewId, null>[];
  /** Upload tiles: what the file chooser accepts. */
  accept?: string;
  /** A kind with no landing door of its own says so — shown under its input. */
  fallbackNote?: string;
  /**
   * What a Source added through this tile IS, as a noun ("Web page",
   * "Transcript") — the card and the review say this, never the tile's
   * instruction ("A web page") nor the stored type ("Document"). Null = it
   * depends on the Source (a reused Source says its own kind).
   */
  noun: string | null;
}

export const SOURCE_KINDS: readonly SourceKindDef[] = [
  {
    id: "your_sources",
    noun: null,
    label: "Your sources",
    helper: "Reuse something you already added — recent first.",
    icon: Library,
    control: "your_sources",
  },
  {
    id: "files",
    noun: "File",
    label: "Your files",
    helper: "Pick a PDF, document or slide deck you already stored.",
    icon: FolderOpen,
    control: "picker",
    pickerViews: ["files"],
  },
  {
    id: "notes",
    noun: "Note",
    label: "A note",
    helper: "Use one of your notes as it is.",
    icon: StickyNote,
    control: "picker",
    pickerViews: ["notes"],
  },
  {
    id: "records",
    noun: null,
    label: "Documents & tables",
    helper: "A document, table or workbook you keep here.",
    icon: FileStack,
    control: "picker",
    pickerViews: ["documents", "tables", "workbooks"],
  },
  {
    id: "upload",
    noun: "File",
    label: "Upload a file",
    helper: "PDFs, Word, slides, text — read and kept for next time.",
    icon: Upload,
    control: "upload",
    accept:
      ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.html,.json",
  },
  {
    id: "paste",
    noun: "Pasted text",
    label: "Paste text",
    helper: "Notes, an article, a chapter — anything you can copy.",
    icon: ClipboardType,
    control: "paste",
  },
  {
    id: "web",
    noun: "Web page",
    label: "A web page",
    helper: "Paste a link — we read the page and keep a copy.",
    icon: Globe,
    control: "url",
  },
  {
    id: "youtube",
    noun: "YouTube video",
    label: "A YouTube video",
    helper: "Paste a link — we write out what was said.",
    icon: Youtube,
    control: "youtube",
    fallbackNote:
      "Videos are written out first, then kept as a Source — it can take a minute for a long one.",
  },
  {
    id: "audio",
    noun: "Recording",
    label: "A recording",
    helper: "Drop an audio or video file — we write out what was said.",
    icon: FileAudio,
    control: "audio",
    accept: "audio/*,video/*",
    fallbackNote:
      "Recordings are uploaded, written out, then kept as a Source — a long one takes a few minutes.",
  },
  {
    id: "image",
    noun: "Image",
    label: "An image",
    helper: "A photo of a page, a slide, a whiteboard.",
    icon: ImageIcon,
    control: "upload",
    accept: "image/*",
  },
  {
    id: "topic",
    noun: "Topic",
    label: "Just a topic",
    helper: "No material — name the subject and we start from it.",
    icon: Lightbulb,
    control: "topic",
  },
];

export const ALL_SOURCE_KIND_IDS: readonly SourceKindId[] = SOURCE_KINDS.map(
  (k) => k.id,
);

/** The tiles a host allows, in registry order. Unknown ids are ignored. */
export function visibleSourceKinds(
  kinds: readonly SourceKindId[] | undefined,
): SourceKindDef[] {
  if (!kinds) return [...SOURCE_KINDS];
  const allowed = new Set(kinds);
  return SOURCE_KINDS.filter((k) => allowed.has(k.id));
}

export function sourceKindDef(id: SourceKindId): SourceKindDef {
  const def = SOURCE_KINDS.find((k) => k.id === id);
  if (!def) throw new Error(`Unknown Source kind "${id}"`);
  return def;
}

/** The key a Source goes by across screens: "<resource_type>:<resource_id>". */
export function sourceKey(ref: { resource_type: string; resource_id: string }): string {
  return `${ref.resource_type}:${ref.resource_id}`;
}

/** Stored types a picked record may be, in words (records picked from "Documents & tables"). */
const RECORD_NOUNS: Record<string, string> = {
  file: "File",
  cld_file: "File",
  note: "Note",
  processed_document: "Document",
  user_table: "Table",
  table: "Table",
  workbook: "Workbook",
  fc_set: "Flashcard deck",
};

/**
 * THE noun for one picked Source — its real kind (V2-F #5: the review called a
 * YouTube video and pasted text "Document"). A reused Source says the kind it
 * was captured as (`draft.sourceKind`, the Sources list's own words).
 */
export function sourceKindNoun(draft: Pick<SourceDraft, "kind" | "ref" | "sourceKind">): string {
  if (draft.sourceKind) return SOURCE_KIND_LABEL[sourceKindGroup(draft.sourceKind)];
  const noun = sourceKindDef(draft.kind).noun;
  if (noun) return noun;
  const type = draft.ref?.resource_type;
  if (type && RECORD_NOUNS[type]) return RECORD_NOUNS[type];
  return type === "processed_document" || draft.kind === "your_sources" ? "Source" : "Record";
}
