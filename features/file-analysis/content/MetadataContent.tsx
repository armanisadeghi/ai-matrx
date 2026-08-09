/**
 * MetadataContent — formatted view of the PDF info dict + page-count + flags.
 * Not a JSON dump.
 */

"use client";

import { asObject, findResult, type MetadataPayload } from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  results: FileAnalysisResultRow[];
}

export function MetadataContent({ results }: Props) {
  const result = findResult(results, "metadata");
  const payload = asObject<MetadataPayload>(result?.payload);

  if (!payload) {
    return (
      <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        Metadata extraction hasn't finished yet.
      </div>
    );
  }

  const rows: Array<[string, string]> = [];
  if (payload.info?.title) rows.push(["Title", payload.info.title]);
  if (payload.info?.author) rows.push(["Author", payload.info.author]);
  if (payload.info?.subject) rows.push(["Subject", payload.info.subject]);
  if (payload.info?.creator) rows.push(["Creator", payload.info.creator]);
  if (payload.info?.producer) rows.push(["Producer", payload.info.producer]);
  if (payload.info?.creationDate)
    rows.push(["Created", payload.info.creationDate]);
  if (payload.info?.modDate) rows.push(["Modified", payload.info.modDate]);
  rows.push(["Page count", String(payload.page_count)]);
  rows.push(["Encrypted", payload.is_encrypted ? "Yes" : "No"]);
  if (payload.needs_pass != null)
    rows.push(["Needs password", payload.needs_pass ? "Yes" : "No"]);

  return (
    <div className="rounded border border-border bg-card">
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border/40 last:border-0">
              <td className="w-32 bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground">
                {k}
              </td>
              <td className="px-3 py-1.5 break-words">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
