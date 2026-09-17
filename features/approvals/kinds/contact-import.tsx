"use client";

/**
 * `contact_import` — a Google contact an agent wants to bring in as a Person.
 *
 * THE FIELD MAP IS THE REVIEW SURFACE, and the tool says so itself: every value
 * shows the Person field it lands in and that it came from Google Contacts. So
 * this component renders that map and nothing else — it does not guess which
 * Person will match, because the dry run does not know either. The match is
 * made by the CRM's one create path (`resolve_party`) when the change is
 * applied, which enriches an existing Person rather than duplicating them and
 * never overwrites a value a person edited here.
 *
 * Saying more than that on this screen would be inventing a promise the
 * preview cannot keep.
 */

import type { Json } from "@/types/database.types";
import type { ApprovalKind, ApprovalScope } from "../types";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  isJsonRecord,
  readArray,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "contact_import";
const PAYLOAD_KIND = "contact_import_dry_run";

/**
 * The Person fields this import can write, in the words the CRM uses for them.
 * A field not named here is shown by its own key rather than hidden — a new
 * field appearing on the server must never vanish from the review.
 */
const FIELD_LABEL: Record<string, string> = {
  display_name: "Name",
  first_name: "First name",
  last_name: "Last name",
  job_title: "Job title",
  company: "Company",
  emails: "Email",
  phones: "Phone",
};

interface MappedField {
  field: string;
  label: string;
  values: string[];
}

/** One value, one list, or nothing — read, never coerced into a shape. */
function values(value: Json | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function fieldMap(payload: GoogleProposalPayload): MappedField[] {
  return readArray(payload.preview, "field_map")
    .filter(isJsonRecord)
    .map((row) => {
      const field = readString(row, "person_field") ?? "";
      return {
        field,
        label: FIELD_LABEL[field] ?? field,
        values: values(row.value),
      };
    })
    .filter((row) => row.field.length > 0 && row.values.length > 0);
}

function contactName(payload: GoogleProposalPayload): string {
  const first = readArray(payload.preview, "contacts").find(isJsonRecord);
  return (
    readString(first, "name") ??
    values(first?.emails)[0] ??
    "a Google contact"
  );
}

/** THE ONE COMPONENT for this kind: every value, and the field it lands in. */
function ContactFieldMap({ payload }: { payload: GoogleProposalPayload }) {
  const fields = fieldMap(payload);
  const account = readString(payload.preview, "google_account");

  return (
    <div className="space-y-2">
      {fields.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-2 py-1 font-medium text-muted-foreground">
                  Person field
                </th>
                <th className="px-2 py-1 font-medium text-muted-foreground">
                  Value from Google Contacts
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((row) => (
                <tr
                  key={row.field}
                  className="border-b border-border last:border-0"
                >
                  <td className="w-32 px-2 py-1 align-top text-muted-foreground">
                    {row.label}
                  </td>
                  <td className="break-words px-2 py-1 align-top font-medium text-foreground">
                    {row.values.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This proposal carries no fields to write, so approving it would import
          nothing. Reject it and ask for the import again.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {account ? `From ${account}. ` : ""}If a Person here already matches this
        contact they are enriched, never duplicated, and a value someone edited
        here is never overwritten. Google Contacts is not changed.
      </p>
    </div>
  );
}

const contract: GoogleKindContract = {
  kindId: KIND_ID,
  payloadKind: PAYLOAD_KIND,
  describe: (payload) => {
    const who = contactName(payload);
    const count = fieldMap(payload).length;
    return {
      headline: `Import ${who} from Google Contacts`,
      acceptEffect: `Writes ${count} field${count === 1 ? "" : "s"} onto a Person in your organization — enriching the one that already matches this contact, or creating one if none does. Google Contacts is not changed.`,
      rejectEffect:
        "Imports nothing and leaves your records exactly as they are, with your reason kept on the proposal.",
      body: <ContactFieldMap payload={payload} />,
      ...(count > 0
        ? {}
        : {
            blocked: {
              reason:
                "This proposal carries no fields to write, so approving it would import nothing.",
              whoCan:
                "Reject it and ask for the import again; the agent that proposed it needs fixing.",
            },
          }),
      // No door: which Person this becomes is decided by the resolver when the
      // import runs, so there is no record to open yet. Naming one now would be
      // a guess, and linking to a guess is worse than a missing link.
    };
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
