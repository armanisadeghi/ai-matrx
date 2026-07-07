// features/education/onboard/export/download.ts
//
// Tiny client-only download helpers shared by the data-ownership exports
// (deck / summary / account archive). Pure DOM — no deps.

/** Trigger a browser download of `content` as a file named `filename`. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download a text payload (markdown, csv, tsv, json) as a file. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8;",
): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** Sanitize a title into a safe file basename. */
export function safeFileBase(name: string, fallback = "export"): string {
  return (
    name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80) ||
    fallback
  );
}
