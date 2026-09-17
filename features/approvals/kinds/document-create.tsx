"use client";

/**
 * `document_create` — a NEW Google Doc an agent wants to create in this
 * person's own Drive.
 *
 * Two things decide it: what the document will be CALLED, and what it starts
 * with. The tool's dry run carries the title and the character count
 * (`would_create`); the starting text itself is in the stored `arguments` —
 * the exact bytes Approve re-runs with — so the first lines shown here are the
 * first lines that will exist. Nothing is composed in the browser.
 *
 * Creating a file destroys nothing, so the sentences say that plainly rather
 * than borrowing a warning from the kinds that overwrite.
 */

import type { ApprovalKind, ApprovalScope } from "../types";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  readNumber,
  readRecord,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "document_create";
const PAYLOAD_KIND = "document_create_dry_run";

/** Enough to recognise the document, not so much that nobody reads it. */
const PREVIEW_LINES = 12;

function titleOf(payload: GoogleProposalPayload): string | null {
  return (
    readString(readRecord(payload.preview, "would_create"), "title") ??
    readString(payload.arguments, "title")
  );
}

/** THE ONE COMPONENT for this kind: the name it gets, and how it starts. */
function NewDocumentPreview({ payload }: { payload: GoogleProposalPayload }) {
  const would = readRecord(payload.preview, "would_create");
  const startingChars = readNumber(would, "starting_chars");
  const text = readString(payload.arguments, "text");
  const lines = text ? text.split("\n") : [];
  const shown = lines.slice(0, PREVIEW_LINES);

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border">
        <div className="border-b border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            New document
          </p>
          <p className="break-words text-xs font-medium text-foreground">
            {titleOf(payload) ?? "Untitled"}
          </p>
        </div>
        <div className="px-3 py-2">
          {text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-xs text-foreground">
              {shown.join("\n")}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              It starts empty — the document is created with no content.
            </p>
          )}
        </div>
      </div>
      {lines.length > shown.length ? (
        <p className="text-[11px] text-muted-foreground">
          Showing the first {shown.length} of {lines.length.toLocaleString()}{" "}
          lines
          {startingChars === null
            ? ""
            : ` (${startingChars.toLocaleString()} characters)`}
          . Approving creates the whole document.
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
    return {
      headline: `Create a Google Doc called ${title}`,
      acceptEffect: `Creates “${title}” in your own Google Drive with the starting content below, and registers it so AI Matrx can read it later. Nothing existing is changed.`,
      rejectEffect:
        "Creates nothing, and records the proposal as rejected with your reason.",
      body: <NewDocumentPreview payload={payload} />,
      // No door: the file does not exist yet, so there is nothing to open. A
      // link here would be a dead end, which is the thing the law forbids.
    };
  },
};

export const documentCreateKind: ApprovalKind = {
  id: KIND_ID,
  label: "New document",
  accept: { label: "Create it", keepsReason: false },
  reject: GOOGLE_REJECT_COPY,
  useSource: (scope: ApprovalScope) => useGoogleProposalSource(contract, scope, documentCreateKind),
  useDecisions: (scope: ApprovalScope) =>
    useGoogleApprovalDecisions(KIND_ID, scope),
  scopeRequirement: GOOGLE_OPERATOR_SCOPE,
};
