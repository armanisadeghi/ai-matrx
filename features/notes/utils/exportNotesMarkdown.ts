// features/notes/utils/exportNotesMarkdown.ts
//
// Client-side Markdown export for notes. Single note → a plain .md Blob
// download (same as the long-standing per-row export). Multiple notes →
// a JSZip bundle, mirroring features/image-studio/utils/download-bundle.ts.

import JSZip from "jszip";

export interface ExportableNote {
  id: string;
  label: string;
  content: string | null | undefined;
}

/** Strip characters that are invalid/awkward in filenames across OSes. */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return cleaned.length > 0 ? cleaned : "Untitled";
}

/** Downloads a single note as a `.md` file. */
export function downloadNoteAsMarkdown(note: ExportableNote): void {
  const blob = new Blob([note.content ?? ""], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(note.label)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Downloads multiple notes as a single `.zip` of `.md` files. Duplicate
 * sanitized filenames (e.g. two notes both labeled "Untitled") are
 * disambiguated with a short id suffix so nothing silently overwrites.
 */
export async function downloadNotesAsMarkdownZip(
  notes: ExportableNote[],
  zipFilename = "notes-export.zip",
): Promise<void> {
  if (notes.length === 0) return;
  if (notes.length === 1) {
    downloadNoteAsMarkdown(notes[0]);
    return;
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const note of notes) {
    const base = sanitizeFilename(note.label);
    let filename = `${base}.md`;
    if (usedNames.has(filename)) {
      filename = `${base}-${note.id.slice(0, 8)}.md`;
    }
    usedNames.add(filename);
    zip.file(filename, note.content ?? "");
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
