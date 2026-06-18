import type { DocumentRow, DocumentSource } from "@/features/data-tables/types";
import { compareTimestamps } from "@/utils/datetime";

export type DocumentSortKey = "name" | "updated" | "created" | "source";

export const DOCUMENT_SORT_OPTIONS: ReadonlyArray<{
  value: DocumentSortKey;
  label: string;
}> = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "name", label: "Name (A→Z)" },
  { value: "source", label: "Source" },
];

const SOURCE_LABELS: Record<DocumentSource, string> = {
  created: "Created",
  imported_docx: "Imported DOCX",
  imported_md: "Imported Markdown",
  imported_txt: "Imported Text",
};

export function documentSourceLabel(source: DocumentSource): string {
  return SOURCE_LABELS[source] ?? source;
}

export function documentMatchesQuery(doc: DocumentRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    doc.document_name.toLowerCase().includes(q) ||
    (doc.description?.toLowerCase().includes(q) ?? false)
  );
}

export function sortDocuments(
  docs: DocumentRow[],
  sortKey: DocumentSortKey,
): DocumentRow[] {
  const arr = [...docs];
  arr.sort((a, b) => {
    switch (sortKey) {
      case "name":
        return (
          a.document_name.localeCompare(b.document_name) ||
          compareTimestamps(b.updated_at, a.updated_at)
        );
      case "source":
        return (
          documentSourceLabel(a.source).localeCompare(
            documentSourceLabel(b.source),
          ) || a.document_name.localeCompare(b.document_name)
        );
      case "created":
        return (
          compareTimestamps(b.created_at, a.created_at) ||
          a.document_name.localeCompare(b.document_name)
        );
      case "updated":
      default:
        return (
          compareTimestamps(b.updated_at, a.updated_at) ||
          a.document_name.localeCompare(b.document_name)
        );
    }
  });
  return arr;
}
