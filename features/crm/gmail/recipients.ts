// features/crm/gmail/recipients.ts
//
// Which addresses a Gmail message from this record may go to.
//
// Pure — no Supabase, no React — so the compose panel, the approval kind and
// the tests all read the SAME answer. The contact points are already loaded by
// whoever opened the compose window (`usePartyDetail`), so nothing here reads
// the database and nothing here can be an unbounded read.

import type { ContactPoint } from "@/features/crm/types";

/** One address the compose window may pick, with what the record knows about it. */
export interface GmailRecipientOption {
  /** The address itself. */
  address: string;
  /** `crm.party_contact_point.id` — the association on the sent record. */
  contactPointId: string;
  /** `crm.contact_medium.id` — what the compliance gate is asked about. */
  mediumId: string;
  /** The point's own label ("Work", "Personal") when it carries one. */
  label: string | null;
  isPrimary: boolean;
  /**
   * Set when this address is suppressed, bounced or otherwise not contactable
   * according to the record itself. It is NOT the verdict — `crm.check_send_
   * eligibility` is the one authority — but a record that already knows an
   * address is dead should not offer it first without saying so.
   */
  warning: string | null;
}

function addressOf(point: ContactPoint): string | null {
  const value = point.medium.display_value ?? point.medium.value_raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.includes("@") ? trimmed : null;
}

function warningFor(point: ContactPoint): string | null {
  const medium = point.medium;
  if (medium.is_contactable === false) {
    return "This record marks the address as not contactable.";
  }
  if (medium.complaint_at) return "This address reported a message as spam.";
  if (medium.bounce_type === "hard" || (medium.bounce_count ?? 0) > 0) {
    return "Mail to this address has bounced before.";
  }
  if (medium.suppression_reason) {
    return `Suppressed here as "${medium.suppression_reason}".`;
  }
  return null;
}

/**
 * Every email address on the record, primary first, then the rest by label.
 *
 * Deleted points and non-email channels are excluded; a point whose medium
 * holds no `@` is excluded because it cannot be a recipient. An address the
 * record holds twice appears once — the first (highest-ranked) point wins, so
 * the association on the sent record is the primary one.
 */
export function gmailRecipientOptions(
  points: ContactPoint[],
): GmailRecipientOption[] {
  const seen = new Set<string>();
  const options: GmailRecipientOption[] = [];

  const ranked = [...points]
    .filter((point) => point.medium.channel === "email")
    .filter((point) => !point.deleted_at && !point.medium.deleted_at)
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return (a.label ?? "").localeCompare(b.label ?? "");
    });

  for (const point of ranked) {
    const address = addressOf(point);
    if (!address) continue;
    const key = address.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      address,
      contactPointId: point.id,
      mediumId: point.medium.id,
      label: point.label ?? null,
      isPrimary: Boolean(point.is_primary),
      warning: warningFor(point),
    });
  }

  return options;
}

/** The address a compose window opens on, or null when the record has none. */
export function defaultGmailRecipient(
  options: GmailRecipientOption[],
): GmailRecipientOption | null {
  return options.find((option) => !option.warning) ?? options[0] ?? null;
}

/** Split a typed "a@b.com, c@d.com" field the way the review card does. */
export function parseAddressList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
