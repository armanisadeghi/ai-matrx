/**
 * features/connectors/import/field-labels.ts
 *
 * 🚨 ONE PLACE TURNS A COLUMN NAME INTO WORDS, AND ONE PLACE WRITES THE
 * PROVENANCE SENTENCE.
 *
 * Both import panels report per-field outcomes, and both used to print what the
 * server sent them verbatim: the Tasks panel rendered
 * `task.kept_local.join(", ")`, so a person read "due_date, description was
 * edited here" — raw database column names in a sentence meant for a
 * non-technical expert (VERIFY-B1-B2 D9, Law 10). The Contacts panel had labels
 * only because the server happened to send them.
 *
 * And per-field provenance — "from Google Contacts, imported 12 Sep 2026" — is
 * the sentence the whole import exists to be able to say. It appeared NOWHERE
 * (B4). The server side of it is real but inert until aidream regenerates its
 * models, so these helpers render what the server sends and say plainly when it
 * sent nothing. THEY NEVER INVENT A DATE.
 *
 * Pure: no React, no network.
 */

/**
 * Column/field key → the words a person reads. Keys are the ones the two
 * `/google-import/*` payloads actually carry (Person fields for contacts,
 * `workspace.tasks` columns for tasks); an unknown key is humanised rather than
 * dropped, so a new server field reads as English instead of vanishing.
 */
const FIELD_LABELS: Record<string, string> = {
  // workspace.tasks
  title: "title",
  description: "description",
  due_date: "due date",
  due_at: "due date",
  status: "status",
  completed_at: "completion",
  notes: "notes",
  priority: "priority",
  // crm.party / contact points
  first_name: "first name",
  last_name: "last name",
  display_name: "name",
  job_title: "job title",
  company: "company",
  emails: "email addresses",
  email: "email address",
  phones: "phone numbers",
  phone: "phone number",
  primary_domain: "website",
};

/** One field key, in words. */
export function importFieldLabel(key: string): string {
  const known = FIELD_LABELS[key];
  if (known) return known;
  return key.replace(/_/g, " ").trim() || key;
}

/**
 * Several field keys, in words, with an Oxford-free "and" — and the VERB that
 * agrees with the count, because "due_date, description was edited here" was
 * wrong twice over.
 */
export function importFieldList(keys: string[]): {
  text: string;
  verb: "was" | "were";
} {
  const labels = keys.map(importFieldLabel);
  const verb = labels.length === 1 ? "was" : "were";
  if (labels.length <= 1) return { text: labels[0] ?? "", verb };
  if (labels.length === 2) return { text: `${labels[0]} and ${labels[1]}`, verb };
  return {
    text: `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`,
    verb,
  };
}

/** How a date is spoken in these panels — never an ISO string at a person. */
export function importDateText(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface ImportProvenanceInput {
  /** Where the value came from, as the server names it (e.g. a resource name). */
  sourceRef?: string | null;
  /** When it was imported, as the server recorded it. */
  importedAt?: string | null;
  /** The human name of the source: "Google Contacts", "Google Tasks". */
  source: string;
}

/**
 * "from Google Contacts, imported 12 Sep 2026" — or the honest absence.
 *
 * `null` means the server recorded no provenance for this value, and the caller
 * says THAT rather than implying a source or a date. On 2026-09-17 the server's
 * provenance columns were live but its generated models did not carry them, so
 * every write was skipped: a panel that filled in a plausible date here would
 * have been lying on every single field.
 */
export function importProvenanceSentence(
  input: ImportProvenanceInput,
): string | null {
  const when = importDateText(input.importedAt);
  if (!input.sourceRef && !when) return null;
  if (when) return `from ${input.source}, imported ${when}`;
  return `from ${input.source}`;
}

/** What a field with no recorded provenance says, in words, once. */
export const IMPORT_PROVENANCE_UNRECORDED =
  "Where this value came from was never recorded, so nothing here can say it came from Google.";
