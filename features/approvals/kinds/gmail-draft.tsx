"use client";

import type { ApprovalKind, ApprovalScope } from "../types";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  readRecord,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "gmail_draft";

function DraftPreview({ payload }: { payload: GoogleProposalPayload }) {
  const preview = readRecord(payload.preview, "preview") ?? payload.preview;
  const account = readString(preview, "account_email");
  const to = readString(preview, "to");
  const subject = readString(preview, "subject");
  const body = readString(preview, "body");
  const cc = preview.cc;
  const recipients = Array.isArray(cc) && cc.every((value) => typeof value === "string") ? cc.join(", ") : null;
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-xs">
      <p>Account: {account ?? "Missing account"}</p>
      <p>To: {to ?? "Missing recipient"}</p>
      <p>Cc: {recipients || "None"}</p>
      <p>Subject: {subject ?? "Missing subject"}</p>
      <pre className="whitespace-pre-wrap break-words font-sans">{body ?? "Missing message"}</pre>
    </div>
  );
}

const contract: GoogleKindContract = {
  kindId: KIND_ID,
  payloadKind: "gmail_draft_dry_run",
  describe: (payload) => {
    const preview = readRecord(payload.preview, "preview") ?? payload.preview;
    const account = readString(preview, "account_email");
    const to = readString(preview, "to");
    const subject = readString(preview, "subject");
    const body = readString(preview, "body");
    const cc = preview.cc;
    const validCc = Array.isArray(cc) && cc.every((value) => typeof value === "string");
    const blocked = !account || !to || !subject || !body || !validCc;
    return {
      headline: `Save Gmail draft: ${subject ?? "Missing subject"}`,
      acceptEffect: "Saves this message to the selected account's Gmail Drafts.",
      rejectEffect: "Does not create a Gmail draft.",
      body: <DraftPreview payload={payload} />,
      ...(blocked ? { blocked: { reason: "The reviewed draft is incomplete.", whoCan: "Ask the proposer to review it again." } } : {}),
    };
  },
};

export const gmailDraftKind: ApprovalKind = {
  id: KIND_ID,
  label: "Gmail draft",
  accept: { label: "Save to Gmail", keepsReason: false },
  reject: GOOGLE_REJECT_COPY,
  useSource: (scope: ApprovalScope) => useGoogleProposalSource(contract, scope, gmailDraftKind),
  useDecisions: (scope: ApprovalScope) => useGoogleApprovalDecisions(KIND_ID, scope),
  scopeRequirement: GOOGLE_OPERATOR_SCOPE,
};
