"use client";

/**
 * `document_append` — a block of text an agent wants added to the END of one of
 * this person's Google Docs.
 *
 * The whole review is two facts, and the tool's own dry run carries both: THE
 * EXACT BLOCK, and WHERE IT LANDS. Nothing here re-derives either. The
 * producer runs `append_document` with `dry_run: true`, which reads the
 * document the same way the real append does — so the position shown is the
 * position the write uses — and stores that preview verbatim.
 *
 * Approve re-runs the same `append_document` call on the server through the one
 * door (`../google-door.ts`). Reject leaves the document untouched.
 */

import type { ApprovalKind, ApprovalScope } from "../types";
import { formatCount } from "@ai-matrx/kit/format";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  OpenInGoogle,
  readNumber,
  readRecord,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "document_append";
const PAYLOAD_KIND = "document_append_dry_run";

/** How the counted characters read on screen. A missing count says so. */
function characters(count: number | null): string {
  if (count === null) return "an unknown number of characters";
  return `${formatCount(count)} character${count === 1 ? "" : "s"}`;
}

/**
 * THE ONE COMPONENT for this kind: the block, and where it goes.
 *
 * The text is shown in full and pre-wrapped — this is prose a person is being
 * asked to publish into their own document, and a truncated preview is how
 * somebody approves a paragraph they never read. The last of the document is
 * shown above it, dimmed, so the join is visible rather than described.
 */
function AppendPreview({ payload }: { payload: GoogleProposalPayload }) {
  const would = readRecord(payload.preview, "would_append");
  const text = readString(would, "text");
  const tail = readString(would, "document_ends_with");
  const afterChar = readNumber(would, "after_char");
  const title = readString(payload.preview, "title");
  const totalChars = readNumber(payload.preview, "total_chars");

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Lands at the very end of {title ? `“${title}”` : "the document"}
        {afterChar === null
          ? ""
          : `, after character ${formatCount(afterChar)}`}
        {totalChars === null
          ? "."
          : ` of ${formatCount(totalChars)}. Nothing already in the document is changed or removed.`}
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        {tail ? (
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              The document ends like this now
            </p>
            <pre className="whitespace-pre-wrap break-words font-sans text-[11px] text-muted-foreground">
              {tail}
            </pre>
          </div>
        ) : null}
        <div className="px-3 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            This is added
          </p>
          {text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-xs text-foreground">
              {text}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              This proposal carries no text to add, so approving it would write
              nothing. Reject it and ask for the change again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const contract: GoogleKindContract = {
  kindId: KIND_ID,
  payloadKind: PAYLOAD_KIND,
  describe: (payload) => {
    const would = readRecord(payload.preview, "would_append");
    const text = readString(would, "text");
    const title = readString(payload.preview, "title") ?? "a Google Doc";
    const link = readString(payload.preview, "open_in_google");
    return {
      headline: `Add ${characters(text === null ? null : text.length)} to the end of ${title}`,
      acceptEffect: `Appends this block to the end of ${title} in Google Docs. Nothing already in the document is changed. Google keeps its own version history; we do not undo it for you.`,
      rejectEffect:
        "Leaves the document exactly as it is and records the proposal as rejected with your reason.",
      body: <AppendPreview payload={payload} />,
      doors: <OpenInGoogle href={link} label="Open the doc in Google" />,
      // A click that would do nothing says so instead of reporting success
      // over an empty write.
      ...(text
        ? {}
        : {
            blocked: {
              reason:
                "This proposal carries no text, so approving it would add nothing to the document.",
              whoCan:
                "Reject it and ask for the change again; the agent that proposed it needs fixing.",
            },
          }),
    };
  },
};

export const documentAppendKind: ApprovalKind = {
  id: KIND_ID,
  label: "Document addition",
  accept: {
    label: "Add it",
    // The apply door takes the approval id and nothing else — see
    // GOOGLE_REJECT_COPY's note. Asking for a note we then drop is a lie.
    keepsReason: false,
  },
  reject: GOOGLE_REJECT_COPY,
  useSource: (scope: ApprovalScope) => useGoogleProposalSource(contract, scope, documentAppendKind),
  useDecisions: (scope: ApprovalScope) =>
    useGoogleApprovalDecisions(KIND_ID, scope),
  scopeRequirement: GOOGLE_OPERATOR_SCOPE,
};
