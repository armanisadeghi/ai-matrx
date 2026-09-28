/**
 * Plain words for a file's "family" — everything already made from one file
 * (its clean text, raw text, pages, searchable parts, analysis…).
 *
 * The inventory RPC (`get_file_resource_family`) speaks in storage keys, tool
 * names and categories ("RAG chunks · search · knowledge_search"). The person
 * choosing is a non-technical expert, so every choice here is said as an
 * OUTCOME: what the AI gets, and what it costs. Shared by the chat attachment
 * chip and the one Source input (both render `ResourceFamilyPolicyEditor`).
 */

import type { DocumentRepresentation } from "@/features/agents/types/instance.types";

/** The "what the AI reads" choices, in the order they are offered. */
export const PRIMARY_FORM_CHOICES: ReadonlyArray<{
  value: "auto" | DocumentRepresentation;
  label: string;
  detail: string;
}> = [
  {
    value: "auto",
    label: "Best available",
    detail: "Clean text when it is ready, otherwise the text as read, otherwise the original PDF.",
  },
  {
    value: "clean",
    label: "Clean text",
    detail: "Best for most things — tidy text without page clutter.",
  },
  {
    value: "raw",
    label: "Text exactly as read",
    detail: "Every line as it came off the page, headers and page numbers included.",
  },
  {
    value: "pdf",
    label: "Original PDF",
    detail: "Keeps layout and images, uses more space.",
  },
];

/** The short name of a primary form (chips, tooltips). */
export function primaryFormShortLabel(
  representation: DocumentRepresentation | undefined,
): string {
  if (!representation) return "Best available";
  if (representation === "pdf") return "Original PDF";
  return representation === "clean" ? "Clean text" : "Text as read";
}

interface FamilyWords {
  label: string;
  /** What having it gives the AI, in one short clause. */
  detail: string;
}

const FAMILY_WORDS: Record<string, FamilyWords> = {
  file_metadata: { label: "File details", detail: "name, type, size and dates" },
  file_variants: { label: "Other versions of this file", detail: "copies and conversions made from it" },
  clean: { label: "Clean text", detail: "tidy text, best for most things" },
  raw: { label: "Text exactly as read", detail: "every line from the page" },
  pages: { label: "Page by page", detail: "lets the AI go to a single page" },
  pdf: { label: "Original PDF", detail: "layout and images, uses more space" },
  knowledge_assets: { label: "Summaries and notes", detail: "made from this file earlier" },
  rag: { label: "Searchable parts", detail: "lets the AI find just the passages it needs" },
  image_metadata: { label: "Image details", detail: "size, camera and what is in the picture" },
  file_analysis: { label: "Analysis", detail: "what an earlier analysis found" },
  analysis_results: { label: "Analysis results", detail: "answers from earlier analysis" },
  detected_entities: { label: "People, places and names", detail: "picked out of the file" },
  page_annotations: { label: "Page notes", detail: "notes made on its pages" },
  overrides: { label: "Your corrections", detail: "fixes you made to what was read" },
  file_structure: { label: "Outline", detail: "its headings and sections" },
};

/** The plain name and outcome for one family member; unknown keys fall back to the server's label. */
export function familyWords(key: string, serverLabel: string, count: number): FamilyWords {
  const words = FAMILY_WORDS[key];
  const label = words?.label ?? serverLabel;
  const detail = words?.detail ?? "available if the AI needs it";
  // A count only says something when there is more than one of it.
  return { label, detail: count > 1 ? `${detail} · ${count.toLocaleString()}` : detail };
}

const CAPABILITY_WORDS: Record<string, string> = {
  context: "see the file's details",
  document_content: "read the text",
  document_search: "search inside it",
  knowledge_search: "find the passages it needs",
};

/** "The AI can also …" — tool names said as what they let the AI do. */
export function capabilitySentence(capabilities: readonly string[]): string | null {
  const phrases = capabilities.map(
    (c) => CAPABILITY_WORDS[c] ?? c.replace(/_/g, " "),
  );
  if (phrases.length === 0) return null;
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  return `Whenever it needs to, the AI can also ${list}.`;
}
