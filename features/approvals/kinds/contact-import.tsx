"use client";

/**
 * `contact_import` — a Google contact an agent wants to bring in as a Person.
 *
 * 🚨 aidream lane B-15 (commit `90e10777a`): the agent's contact import now
 * runs through the ONE plan/apply in `aidream/services/google_import/
 * contacts.py`, and `preview.would_write` is that plan, verbatim — never a
 * second opinion computed here. Until B-15 this component re-derived
 * "Writes N fields" by counting `preview.field_map`, which the resolver's own
 * NULL-only enrichment did not actually write
 * (`common-docs/projects/google-native/VERIFY-B1-B2-R4.md` V2).
 *
 * `would_write` IS REQUIRED. There is no pre-B-15 payload to fall back to: the
 * approval queue's `platform.assists` table has held zero `contact_import`
 * rows across four rounds of hostile verification, so a fallback for the old
 * shape would be a second renderer kept alive for data that has never
 * existed — the exact class the no-legacy law names. A payload some future
 * producer writes without a plan is not "the old shape returning"; it is a
 * shape this build cannot read, and it gets the SAME honest, Approve-less row
 * every other unreadable Google payload gets (`../google-proposal.tsx`'s own
 * fallback for a payload that fails to narrow at all) — never a client-side
 * count invented to fill the gap.
 *
 * `preview.field_map` still holds only the rows that LAND (`create` / `fill` /
 * `added`) — that is what the accept-effect count uses when `would_write`
 * omits it, though today it never does. `preview.would_write.plan` is the
 * FULL review: every row, including the ones kept, refused, unchanged or
 * excluded, each carrying the sentence the panel shows — so this screen
 * renders that sentence rather than re-deriving its own copy from raw values.
 *
 * The match is made by the CRM's one create path (`resolve_party`) when the
 * change is applied, which enriches an existing Person rather than
 * duplicating them and never overwrites a value a person edited here unless
 * this organization's `google.contacts.reimport_policy` setting says
 * otherwise. A contact that reaches more than one Person is a REFUSAL, never a
 * guess — this card shows the candidates and offers no Approve.
 */

import type { Json } from "@/types/database.types";
import { importMatchKeyWords } from "@/features/connectors/import/field-labels";
import type { ApprovalKind, ApprovalScope } from "../types";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  isJsonRecord,
  readArray,
  readNumber,
  readRecord,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalCopy,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "contact_import";
const PAYLOAD_KIND = "contact_import_dry_run";

/** One value, one list, or nothing — read, never coerced into a shape. */
function values(value: Json | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

/** A boolean field, read strictly — anything that is not literally `true` is `false`. */
function readBool(record: Record<string, Json> | null | undefined, key: string): boolean {
  return record?.[key] === true;
}

/** One row of the plan, read from either `field_map` or `would_write.plan`. */
interface FieldRow {
  key: string;
  label: string;
  values: string[];
  currentValues: string[];
  explanation: string | null;
}

function fieldRow(row: Record<string, Json>): FieldRow | null {
  const key = readString(row, "key") ?? readString(row, "person_field");
  if (!key) return null;
  return {
    key,
    label: readString(row, "person_label") ?? readString(row, "label") ?? key,
    values: values(row.value),
    currentValues: values(row.current_value),
    explanation: readString(row, "explanation"),
  };
}

/** `preview.would_write` — THE plan. A payload without it cannot be reviewed
 * here; see the module doc for why there is no fallback for its absence. */
function wouldWrite(payload: GoogleProposalPayload): Record<string, Json> | null {
  return readRecord(payload.preview, "would_write");
}

/** The FULL review this card's table shows: every row the plan carries, kept
 * ones and refused ones included, each with the sentence the server wrote
 * for it. */
function fullPlanRows(plan: Record<string, Json>): FieldRow[] {
  return readArray(plan, "plan")
    .filter(isJsonRecord)
    .map(fieldRow)
    .filter((row): row is FieldRow => row !== null);
}

/** The plan's own write count — `writes` (columns) plus `contact_points`
 * (email/phone rows). Never re-derived from the rows this screen renders. */
function planCount(plan: Record<string, Json>): number {
  return (readNumber(plan, "writes") ?? 0) + (readNumber(plan, "contact_points") ?? 0);
}

function contactName(payload: GoogleProposalPayload): string {
  const first = readArray(payload.preview, "contacts").find(isJsonRecord);
  return (
    readString(first, "name") ??
    values(first?.emails)[0] ??
    "a Google contact"
  );
}

interface AmbiguousCandidate {
  personId: string;
  personName: string;
  matchedBy: string;
}

/**
 * This contact reaching more than one Person, when the plan carries that
 * refusal. The live server tool refuses `import_contact` outright before a
 * proposal is ever queued (`_import_contact` returns `error_type ==
 * "contact_ambiguous"`, and the propose path hands that refusal straight back
 * without calling `write_proposal`) — so this branch does not fire from
 * today's producer. It stays defensive rather than assumed away: a producer
 * that ever DID queue this refusal must never show a live Approve over it,
 * per `_ambiguity_note` on the server (`aidream/services/google_import/
 * contacts.py`) and `PersonCandidate`.
 */
function ambiguousRefusal(
  preview: Record<string, Json>,
  plan: Record<string, Json>,
): AmbiguousCandidate[] | null {
  const isAmbiguous =
    readString(preview, "error_type") === "contact_ambiguous" || readBool(plan, "choice_required");
  if (!isAmbiguous) return null;
  const raw = readArray(preview, "candidates");
  const rows = (raw.length > 0 ? raw : readArray(plan, "candidates"))
    .filter(isJsonRecord)
    .map((row) => {
      const personId = readString(row, "person_id");
      const personName = readString(row, "person_name");
      if (!personId || !personName) return null;
      return { personId, personName, matchedBy: readString(row, "matched_by") ?? "" };
    })
    .filter((row): row is AmbiguousCandidate => row !== null);
  return rows;
}

/** The queue's own words for a shape it cannot review — the same honest,
 * Approve-less row `google-proposal.tsx` gives a payload that fails to
 * narrow at all, worded for this specific gap. */
function unreadablePlanNotice(): { reason: string; whoCan: string } {
  return {
    reason:
      "This proposal does not carry the import's plan, so this screen cannot say how many fields it writes or what happens to each one.",
    whoCan: "Reject it and ask for the import again — the new proposal will carry the plan.",
  };
}

/** THE ONE COMPONENT for this kind: the full plan, in the server's own words. */
function ContactFieldMap({ payload }: { payload: GoogleProposalPayload }) {
  const plan = wouldWrite(payload);
  if (!plan) {
    return (
      <p className="text-xs text-muted-foreground">{unreadablePlanNotice().reason}</p>
    );
  }
  const ambiguous = ambiguousRefusal(payload.preview, plan);
  const account = readString(payload.preview, "google_account");
  const rows = fullPlanRows(plan);
  const kept = readArray(plan, "kept_fields");
  const refused = readArray(plan, "refused_fields");
  const reimportPolicy = readString(plan, "reimport_policy");
  const personName = readString(plan, "person_name");
  const matchedBy = readString(plan, "matched_by");
  // Law 4 (nothing fails silently): a warning the server carries — a missing
  // knob, a policy it could not read — is shown, never swallowed.
  const warnings = readArray(plan, "warnings").filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (ambiguous) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-destructive">
          NOTHING WAS WRITTEN. This contact reaches{" "}
          {ambiguous.length > 0 ? ambiguous.length : "more than one"} People here, so nobody
          can approve this as written.
        </p>
        {ambiguous.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
            {ambiguous.map((candidate) => (
              <li key={candidate.personId}>
                {candidate.personName}
                {candidate.matchedBy
                  ? ` — matched by ${importMatchKeyWords(candidate.matchedBy)}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          Open the People named above, merge the duplicate or move the identity that is on the
          wrong one, then ask for the import again. This import will not choose one for you,
          and Google Contacts is not changed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-2 py-1 font-medium text-muted-foreground">Person field</th>
                <th className="px-2 py-1 font-medium text-muted-foreground">What happens</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="w-32 px-2 py-1 align-top text-muted-foreground">{row.label}</td>
                  <td className="break-words px-2 py-1 align-top font-medium text-foreground">
                    {row.explanation ??
                      (row.values.length > 0
                        ? `Value from Google Contacts: ${row.values.join(", ")}`
                        : row.currentValues.length > 0
                          ? `Already here: ${row.currentValues.join(", ")}`
                          : "Nothing to write.")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Everything Google has about this contact is already here, or is kept as it is —
          approving this proposal would import nothing.
        </p>
      )}
      {(personName || matchedBy) && (
        <p className="text-[11px] text-muted-foreground">
          {personName ? `Matches ${personName}` : "Matches an existing Person"}
          {matchedBy ? ` by ${importMatchKeyWords(matchedBy)}.` : "."}
        </p>
      )}
      {kept.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {kept.length} value{kept.length === 1 ? "" : "s"} changed here since the last import{" "}
          {kept.length === 1 ? "stays" : "stay"} as they are.
        </p>
      )}
      {refused.length > 0 && (
        <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
          {refused.length} field{refused.length === 1 ? "" : "s"} would not be written at all
          — see the row{refused.length === 1 ? "" : "s"} above for why.
        </p>
      )}
      {reimportPolicy && (
        <p className="text-[11px] text-muted-foreground">
          When Google disagrees with a value changed here, this organization's setting (
          {reimportPolicy.replace(/_/g, " ")}) decides what happens.
        </p>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ))}
      <p className="text-[11px] text-muted-foreground">
        {account ? `From ${account}. ` : ""}If a Person here already matches this contact they
        are enriched, never duplicated, and a value someone edited here is never overwritten
        unless this organization's re-import setting says otherwise. Google Contacts is not
        changed.
      </p>
    </div>
  );
}

const contract: GoogleKindContract = {
  kindId: KIND_ID,
  payloadKind: PAYLOAD_KIND,
  describe: (payload) => {
    const who = contactName(payload);
    const plan = wouldWrite(payload);

    if (!plan) {
      return {
        headline: `Import ${who} from Google Contacts`,
        acceptEffect: "Nothing — this proposal cannot be read.",
        rejectEffect:
          "Records it as rejected so it stops waiting on you. Nothing in Google or your records changes.",
        body: <ContactFieldMap payload={payload} />,
        blocked: unreadablePlanNotice(),
      } satisfies GoogleProposalCopy;
    }

    const ambiguous = ambiguousRefusal(payload.preview, plan);
    if (ambiguous) {
      return {
        headline: `Import ${who} from Google Contacts`,
        acceptEffect:
          "Nothing — this contact matches more than one Person here, so nobody can approve it as written.",
        rejectEffect:
          "Records it as rejected so it stops waiting on you. Nothing in Google or your records changes.",
        body: <ContactFieldMap payload={payload} />,
        blocked: {
          reason: `This contact reaches ${ambiguous.length > 0 ? ambiguous.length : "more than one"} People here, so nothing can be written until somebody decides which one it is.`,
          whoCan:
            "Open the People named in the review, merge the duplicate or move the identity that is on the wrong one, then ask for the import again.",
        },
      } satisfies GoogleProposalCopy;
    }

    const promise = readString(plan, "promise");
    const count = planCount(plan);
    return {
      headline: `Import ${who} from Google Contacts`,
      // 🚨 THE PLAN'S OWN SENTENCE — never a count re-derived from the rows
      // this screen happens to be able to read (VERIFY-B1-B2-R4.md V2).
      acceptEffect:
        promise ??
        `Writes ${count} field${count === 1 ? "" : "s"} onto a Person in your organization — enriching the one that already matches this contact, or creating one if none does. Google Contacts is not changed.`,
      rejectEffect:
        "Imports nothing and leaves your records exactly as they are, with your reason kept on the proposal.",
      body: <ContactFieldMap payload={payload} />,
      ...(count > 0
        ? {}
        : {
            blocked: {
              reason:
                "Everything Google has about this contact is already here, or is kept as it is — approving this proposal would import nothing.",
              whoCan:
                "Reject it if you don't need to see it again, or leave it — either way nothing is written.",
            },
          }),
      // No door: which Person this becomes is decided by the resolver when the
      // import runs, so there is no record to open yet. Naming one now would be
      // a guess, and linking to a guess is worse than a missing link.
    } satisfies GoogleProposalCopy;
  },
};

export const contactImportKind: ApprovalKind = {
  id: KIND_ID,
  label: "Contact import",
  accept: { label: "Import it", keepsReason: false },
  reject: GOOGLE_REJECT_COPY,
  useSource: (scope: ApprovalScope) => useGoogleProposalSource(contract, scope, contactImportKind),
  useDecisions: (scope: ApprovalScope) =>
    useGoogleApprovalDecisions(KIND_ID, scope),
  scopeRequirement: GOOGLE_OPERATOR_SCOPE,
};
