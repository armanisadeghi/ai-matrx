/**
 * Command-bar section presentation — filter digits, empty sentences, kind
 * labels, chip labels. Section keys and labels themselves come from the one
 * client (`features/knowledge/api/knowledgeSearch.ts`).
 *
 * Spotlight: every result lives in a typed section with its own heading.
 * Raycast: ⌘-digit jumps; here ⌘1–⌘8 narrow the bar to one section and ⌘0
 * shows every section again.
 */

import {
  KNOWLEDGE_SECTION_LABEL,
  type KnowledgeSectionKey,
} from "@/features/knowledge/api/knowledgeSearch";
import {
  MENTION_REF_TYPE,
  RELATIVE_DATE_LABEL,
  type QueryChip,
} from "@/features/knowledge/api/knowledgeQueryText";

/** ⌘<digit> → section. The pinned top hit has no digit. */
export const SECTION_DIGIT: Partial<Record<KnowledgeSectionKey, number>> = {
  sources: 1,
  segments: 2,
  chats: 3,
  projects_tasks: 4,
  notes: 5,
  files: 6,
  records: 7,
  agents_workflows: 8,
};

export function sectionForDigit(digit: number): KnowledgeSectionKey | null {
  for (const [key, d] of Object.entries(SECTION_DIGIT)) {
    if (d === digit) return key as KnowledgeSectionKey;
  }
  return null;
}

/** "Nothing in Chats for 'x'" — the sentence an empty section shows. */
export function emptySectionSentence(
  key: KnowledgeSectionKey,
  text: string,
): string {
  const label = KNOWLEDGE_SECTION_LABEL[key];
  const q = text.trim();
  return q ? `Nothing in ${label} for '${q}'` : `Nothing recent in ${label}`;
}

/** Human noun for a hit's entity — the row's kind label. */
const ENTITY_LABEL: Record<string, string> = {
  processed_document: "Source",
  segment: "Segment",
  conversation: "Chat",
  note: "Note",
  task: "Task",
  project: "Project",
  file: "File",
  cld_file: "File",
  scope: "Scope",
  agent: "Agent",
  workflow: "Workflow",
  transcript: "Transcript",
  research_topic: "Research topic",
  custom_record: "Record",
};

export function entityLabel(entity: string): string {
  return ENTITY_LABEL[entity] ?? "Record";
}

const TYPE_CHIP_LABEL: Record<string, string> = {
  processed_document: "Sources",
  conversation: "Chats",
  note: "Notes",
  task: "Tasks",
  project: "Projects",
  file: "Files",
  agent: "Agents",
  workflow: "Workflows",
  scope: "Scopes",
};

/** `type:pdf` lands here as uploaded documents — the label says what it searches. */
const SOURCE_KIND_CHIP_LABEL: Record<string, string> = {
  cld_file: "Uploaded documents",
  web_page: "Web pages",
  scrape_parsed_page: "Scraped pages",
  transcript: "Transcripts",
  inline: "Pasted text",
  youtube_video: "YouTube",
};

/** What a chip says — how the bar understood the operator. */
export function chipLabel(chip: QueryChip): string {
  switch (chip.kind) {
    case "type":
      return `Type: ${TYPE_CHIP_LABEL[chip.value] ?? chip.value}`;
    case "source_kind":
      return SOURCE_KIND_CHIP_LABEL[chip.value] ?? `Kind: ${chip.value.replace(/_/g, " ")}`;
    case "origin":
      return `From: ${chip.value}`;
    case "within":
      if (chip.ref.type === MENTION_REF_TYPE) return `@${chip.ref.name ?? ""}`;
      return chip.ref.type === "tag"
        ? `#${chip.ref.name ?? chip.ref.id ?? ""}`
        : `In: ${chip.ref.name ?? chip.ref.id ?? chip.ref.type}`;
    case "entity":
      return `@${chip.value}`;
    case "captured_by":
      return chip.value === "me" ? "Captured by me" : "Captured by anyone";
    case "state":
      return `In ${chip.value}`;
    case "date":
      return chip.value.relative
        ? (RELATIVE_DATE_LABEL[chip.value.relative] ?? chip.value.relative)
        : "Date range";
    case "sort":
      return `Sort: ${chip.value}`;
  }
}
