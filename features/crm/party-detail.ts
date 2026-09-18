/**
 * The Person / Company DOSSIER — the curated field set the Detail primitive
 * shows for a `crm.party` record, and the one extra read it needs.
 *
 * 🚨 N5 (VERIFY-U-P1-R5). Every registered type got the GENERIC formatter
 * (`fieldsFromRow`), which walks `Object.entries()` of a `select *` and shows
 * every populated scalar in PostgREST's key order. For the real Angie Sadeghi
 * row that put `Version=2` first and her own name TENTH, printed `Name Key`
 * (a lowercased dedupe key), `Record Class` and `Version` — pure plumbing — and
 * handed a brilliant non-technical expert two machine words, `Party Kind=person`
 * and `Visibility=internal`. On a richer row the same rule would print
 * `Tax ID`, `Locked Fields`, `Field Provenance` (jsonb, dumped as JSON),
 * `Canonical ID` and `Source Party ID`. The dossier was WORSE than the card it
 * replaced, which already said "Person" / "Company" in words.
 *
 * So this is a CLOSED list, in the order a person reads a contact, and it is
 * the record page's own curation rather than a second opinion: the order and
 * the labels are `buildIdentityCopyView` / `formatIdentityCopy`
 * (`features/crm/components/record/record-copy.ts` — Name, Type, Title,
 * Headline, Legal name, Domain, Do not contact), the kind words are the ONE
 * resolver (`party-words.ts`), the contact points are the ONE read
 * (`partyContactPointsQuery`) under the ONE suppression rule
 * (`reachability.ts`), and `visibility` goes through the platform's plain-words
 * map (`lib/record-words.ts`).
 *
 * Nothing outside this list is shown. A column added to `crm.party` tomorrow
 * does not silently appear in a person's dossier — adding it here is a decision.
 *
 * HOW IT REACHES THE SCREEN. `refinePartyDetail` at the bottom of this file is
 * the party registration's `refineDetail` (features/item-presentation/registry
 * .tsx) — ONE refinement of the generically composed `DetailRecordType`, so
 * window, docked and page all inherit it and nothing here is a second type map,
 * a second loader or a second renderer.
 *
 * WHY A CONTACT VALUE IS NOT A DOOR. `DetailField.ref` REPLACES the field's
 * text with the platform's short-uuid cell, so making an email a door would
 * cost the reader the email. The value is the fact; `crm.contact_medium` has no
 * route or peek anyway. The employer IS a door (a party), and its name rides
 * the label for the same reason — see the escalation in the item-presentation
 * FEATURE.md.
 */

import type {
  DetailField,
  DetailLoadResult,
  DetailRecordType,
  DetailRow,
  DetailSeed,
} from "@/lib/detail/types";
import { formatWhen } from "@/lib/detail/format";
import { hasAnyDoor } from "@/components/official/entity-ref/doors";
import { supabase } from "@/utils/supabase/client";
import { visibilityWords } from "@/lib/record-words";

import { partyKindWord } from "./party-words";
import {
  CONTACT_BLOCK_REASON_LABELS,
  contactPointBlockReason,
} from "./reachability";
import { partyContactPointsQuery } from "./service";
import type { ContactPoint } from "./types";

/** Keys the extras read merges into the row; never rendered as themselves. */
export const PARTY_CONTACT_POINTS_KEY = "__contactPoints";
export const PARTY_CONTACT_POINTS_ERROR_KEY = "__contactPointsError";
export const PARTY_EMPLOYER_KEY = "__employer";

interface PartyEmployerRef {
  id: string;
  display_name: string | null;
}

function text(row: DetailRow, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

function contactPointsOf(row: DetailRow): ContactPoint[] {
  const raw = row[PARTY_CONTACT_POINTS_KEY];
  return Array.isArray(raw) ? (raw as ContactPoint[]) : [];
}

function employerOf(row: DetailRow): PartyEmployerRef | null {
  const raw = row[PARTY_EMPLOYER_KEY];
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { id?: unknown; display_name?: unknown };
  return isUuid(candidate.id)
    ? {
        id: candidate.id,
        display_name:
          typeof candidate.display_name === "string" ? candidate.display_name : null,
      }
    : null;
}

/** One contact line: the value, plus why it may not be used, if it may not. */
function contactLine(row: DetailRow, point: ContactPoint): string {
  const value = point.medium.display_value ?? point.medium.value_raw ?? "";
  const blocked = contactPointBlockReason(
    { do_not_contact: row.do_not_contact === true },
    point,
  );
  const suffix = blocked ? ` · ${CONTACT_BLOCK_REASON_LABELS[blocked]}` : "";
  return `${value}${suffix}`;
}

const CONTACT_CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
};

/** The contact mediums a reader needs first: email, then phone. */
function contactFields(row: DetailRow): DetailField[] {
  const error = row[PARTY_CONTACT_POINTS_ERROR_KEY];
  if (typeof error === "string" && error.trim()) {
    // Law 4: the read failed, so the dossier SAYS it failed. Silence here reads
    // as "this contact has no email", which is a different, false, fact.
    return [
      {
        key: "contact-unreadable",
        label: "Contact",
        text: `We could not read this record's contact methods (${error.trim()}). The record page at its full view can read them again.`,
      },
    ];
  }
  const points = contactPointsOf(row);
  if (points.length === 0) {
    return [
      {
        key: "contact-none",
        label: "Contact",
        text: "No email, phone or handle is recorded here yet.",
      },
    ];
  }
  const out: DetailField[] = [];
  for (const channel of ["email", "phone"] as const) {
    // Already ordered primary-first by the one query.
    const point = points.find((p) => p.channel === channel);
    if (!point) continue;
    out.push({
      key: `contact-${channel}`,
      label: CONTACT_CHANNEL_LABELS[channel] ?? channel,
      text: contactLine(row, point),
    });
  }
  if (out.length === 0) {
    // Handles, social, external ids — real contact, just not email or phone.
    const point = points[0];
    out.push({
      key: "contact-other",
      label: point.channel ? (CONTACT_CHANNEL_LABELS[point.channel] ?? "Contact") : "Contact",
      text: contactLine(row, point),
    });
  }
  return out;
}

/**
 * THE Person / Company field list. Ordered, human-labelled, closed.
 * Absent facts are simply absent — never an empty row, never a machine word.
 */
export function partyDetailFields(row: DetailRow): DetailField[] {
  const fields: DetailField[] = [];
  const push = (key: string, label: string, value: string | null): void => {
    if (value) fields.push({ key, label, text: value });
  };

  push("display_name", "Name", text(row, "display_name"));
  // The word the whole platform uses for this kind — never the enum label.
  push("party_kind", "Type", partyKindWord(row.party_kind));
  push("job_title", "Title", text(row, "job_title"));
  push("headline", "Headline", text(row, "headline"));
  push("legal_name", "Legal name", text(row, "legal_name"));

  const employer = employerOf(row);
  if (employer) {
    const name = employer.display_name?.trim() || null;
    fields.push({
      key: "employer",
      // The name rides the label because a `ref` field renders the platform's
      // short-uuid cell INSTEAD of the text (see the header).
      label: name ? `Company · ${name}` : "Company",
      text: name ?? employer.id,
      ref: { token: "party", id: employer.id },
    });
  }

  push("primary_domain", "Website", text(row, "primary_domain"));
  fields.push(...contactFields(row));

  if (row.do_not_contact === true) {
    push(
      "do_not_contact",
      "Do not contact",
      text(row, "do_not_contact_reason") ??
        "Marked do-not-contact here — no outreach may be sent.",
    );
  }

  // The owner, only as a door that actually opens: a bare 36-character uuid
  // under "Owner" is an identity the UI names and nothing can open.
  const assigned = row.assigned_to;
  if (isUuid(assigned) && hasAnyDoor("user")) {
    fields.push({
      key: "assigned_to",
      label: "Owner",
      text: assigned,
      ref: { token: "user", id: assigned },
    });
  }

  push("visibility", "Who can see this", visibilityWords(row.visibility));
  push(
    "created_at",
    "Added",
    typeof row.created_at === "string" ? formatWhen(row.created_at) : null,
  );
  push(
    "updated_at",
    "Last updated",
    typeof row.updated_at === "string" ? formatWhen(row.updated_at) : null,
  );
  return fields;
}

/**
 * The reads the dossier needs beyond the row: the contact points (the ONE
 * query) and the employer's NAME, so the door names a company instead of an id.
 * A failure here never costs the reader the record — it is recorded on the row
 * and the field list says so.
 */
export async function partyDetailExtras(
  row: DetailRow,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const partyId = typeof row.id === "string" ? row.id : null;
  if (!partyId) return {};
  const employerId = isUuid(row.primary_employer_party_id)
    ? (row.primary_employer_party_id as string)
    : null;

  const extras: Record<string, unknown> = {};
  try {
    const points = await partyContactPointsQuery(partyId).abortSignal(signal);
    if (points.error) throw new Error(points.error.message);
    extras[PARTY_CONTACT_POINTS_KEY] = points.data ?? [];
  } catch (error) {
    if (signal.aborted) return {};
    const message = error instanceof Error ? error.message : String(error);
    console.error("[party-detail] contact points could not be read", error);
    extras[PARTY_CONTACT_POINTS_ERROR_KEY] = message;
  }

  if (employerId) {
    try {
      const { data, error } = await supabase
        .schema("crm")
        .from("party")
        .select("id, display_name")
        .eq("id", employerId)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error(error.message);
      extras[PARTY_EMPLOYER_KEY] = data ?? { id: employerId, display_name: null };
    } catch (error) {
      if (signal.aborted) return extras;
      console.error("[party-detail] the employer's name could not be read", error);
      // The door still opens; it just cannot name the company yet.
      extras[PARTY_EMPLOYER_KEY] = { id: employerId, display_name: null };
    }
  }
  return extras;
}

/**
 * The party registration's ONE refinement of the composed `DetailRecordType`.
 *
 * Three things the generic composition cannot know about `crm.party`:
 *   1. its fields are a CURATED list, not every populated scalar (N5);
 *   2. the dossier needs one read beyond the row — the contact points and the
 *      employer's name — merged in before the fields see it (N5);
 *   3. a nameless record is named by ITS OWN kind, so a company reads "Untitled
 *      Company" and never "Untitled Person" (N6).
 *
 * Everything else — the health producer, the frame, the entity token, the
 * accent, the icon — is the base, untouched.
 */
export function refinePartyDetail(base: DetailRecordType): DetailRecordType {
  const loadRow = base.load;
  return {
    ...base,
    fields: (row) => partyDetailFields(row),
    load: loadRow
      ? async (id: string, signal: AbortSignal): Promise<DetailLoadResult<DetailRow>> => {
          const result = await loadRow(id, signal);
          if (!("row" in result)) return result;
          return { row: { ...result.row, ...(await partyDetailExtras(result.row, signal)) } };
        }
      : null,
    title: (row: DetailRow | null, seed: DetailSeed | null): string => {
      const name = row && typeof row.display_name === "string" ? row.display_name.trim() : "";
      if (name) return name;
      const seeded = seed?.name?.trim();
      if (seeded) return seeded;
      // The record's own word where the row has one; the type's honest generic
      // ("Contact") when there is no row to ask.
      return `Untitled ${row ? partyKindWord(row.party_kind) : base.label}`;
    },
  };
}
