"use client";

/**
 * `spreadsheet_create` — a NEW Google Sheet an agent wants to create in this
 * person's own Drive.
 *
 * The same review as a new document, in a grid: what it will be CALLED, and the
 * rows it starts with. The dry run carries the title, the row count and the
 * first row (`would_create`); the rows themselves are the stored `arguments` —
 * the exact values Approve re-runs with.
 *
 * Creating a file overwrites nothing, and the sentences say so.
 */

import type { ApprovalKind, ApprovalScope } from "../types";
import { formatCount } from "@ai-matrx/kit/format";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  readGrid,
  readNumber,
  readRecord,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "spreadsheet_create";
const PAYLOAD_KIND = "spreadsheet_create_dry_run";

/** Enough rows to recognise the sheet; the count below says what is left. */
const PREVIEW_ROWS = 8;

function titleOf(payload: GoogleProposalPayload): string | null {
  return (
    readString(readRecord(payload.preview, "would_create"), "title") ??
    readString(payload.arguments, "title")
  );
}

/** THE ONE COMPONENT for this kind: the name it gets, and its first rows. */
function NewSheetPreview({ payload }: { payload: GoogleProposalPayload }) {
  const would = readRecord(payload.preview, "would_create");
  const startingRows = readNumber(would, "starting_rows");
  const rows = readGrid(payload.arguments.rows);
  const shown = rows.slice(0, PREVIEW_ROWS);
  const columns = shown.reduce((widest, row) => Math.max(widest, row.length), 0);
  const total = startingRows ?? rows.length;

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border">
        <div className="border-b border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            New spreadsheet
          </p>
          <p className="break-words text-xs font-medium text-foreground">
            {titleOf(payload) ?? "Untitled"}
          </p>
        </div>
        {shown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <tbody>
                {shown.map((row, index) => (
                  <tr
                    key={index}
                    className="border-b border-border last:border-0"
                  >
                    <td className="w-10 px-2 py-1 align-top text-muted-foreground">
                      {index + 1}
                    </td>
                    {Array.from({ length: columns }, (_, column) => (
                      <td
                        key={column}
                        className="max-w-[12rem] break-words px-2 py-1 align-top text-foreground"
                      >
                        {row[column] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            It starts empty — the spreadsheet is created with no rows.
          </p>
        )}
      </div>
      {total > shown.length ? (
        <p className="text-[11px] text-muted-foreground">
          Showing the first {shown.length} of {formatCount(total)} starting
          rows. Approving creates all of them.
        </p>
      ) : null}
    </div>
  );
}

const contract: GoogleKindContract = {
  kindId: KIND_ID,
  payloadKind: PAYLOAD_KIND,
  describe: (payload) => {
    const title = titleOf(payload) ?? "Untitled";
    const rows =
      readNumber(readRecord(payload.preview, "would_create"), "starting_rows") ??
      readGrid(payload.arguments.rows).length;
    return {
      headline: `Create a Google Sheet called ${title}`,
      acceptEffect: `Creates “${title}” in your own Google Drive with ${formatCount(rows)} starting row${rows === 1 ? "" : "s"}, and registers it so AI Matrx can read it later. Nothing existing is changed.`,
      rejectEffect:
        "Creates nothing, and records the proposal as rejected with your reason.",
      body: <NewSheetPreview payload={payload} />,
      // No door: the file does not exist yet.
    };
  },
};

export const spreadsheetCreateKind: ApprovalKind = {
  id: KIND_ID,
  label: "New spreadsheet",
  accept: { label: "Create it", keepsReason: false },
  reject: GOOGLE_REJECT_COPY,
  useSource: (scope: ApprovalScope) => useGoogleProposalSource(contract, scope, spreadsheetCreateKind),
  useDecisions: (scope: ApprovalScope) =>
    useGoogleApprovalDecisions(KIND_ID, scope),
  scopeRequirement: GOOGLE_OPERATOR_SCOPE,
};
