import { plainTitleFromMarkdown } from "@/components/markdown-core/plain-title";

/**
 * The title of pasted notes — the name the note, and every flashcard set,
 * quiz and memory aid made from it, carries. An explicit title wins;
 * otherwise the notes' first heading or line through the ONE plain-text
 * projection (never the raw first line: that is how sets read "# AP …").
 */
export function pastedNotesTitle(raw: string, explicit?: string): string {
  return (
    explicit?.trim() ||
    plainTitleFromMarkdown(raw, { maxLength: 60 }) ||
    "Pasted notes"
  );
}
