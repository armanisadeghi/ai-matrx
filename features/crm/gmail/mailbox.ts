// features/crm/gmail/mailbox.ts
//
// 🚨 THE ONE PARSER FOR A RECIPIENT FIELD. EVERY ADDRESS THE SEND AUTHORITY
// JUDGES COMES OUT OF HERE.
//
// A To or Cc field is not an address — it is an RFC 5322 address LIST, and a
// person writes it the way every mail client shows it: `Ada Lovelace
// <ada@example.com>`, `"Doe, John" <john@x.com>`, `a@x.com, b@y.com`. Until
// 2026-09-17 the Gmail send authority treated the whole field as one address
// string: `normalizeMediumValue` rejected anything with whitespace,
// `findMediumIdForAddress` swallowed that rejection and answered "no row", and
// the preflight read "no row" as "no suppression can exist" and SENT. So a
// person who had unsubscribed was emailed by typing her address the way Gmail
// itself prints it, and the message was recorded on nobody (VERIFY-B1-B2-R2
// N2, breaks A/B/C). The server does parse it — `parseaddr` — and delivers.
//
// THE CLASS FIX IS THIS FILE: the field is parsed into mailboxes FIRST, and
// every later question (may we send? whose record is this? what goes on the
// row?) is asked per PARSED ADDRESS. A field this parser cannot read is never
// waved through — the caller refuses, because "I could not read it" is not
// permission.
//
// Pure: no React, no Supabase, no network.

/** One mailbox out of an address field. */
export interface ParsedMailbox {
  /** The addr-spec, lowercased — what a medium row is keyed on. */
  address: string;
  /** The display name when the field carried one, unquoted. */
  displayName: string | null;
  /** The mailbox exactly as it was written, for a sentence at a person. */
  raw: string;
}

export type MailboxFieldParse =
  | { ok: true; mailboxes: ParsedMailbox[] }
  | {
      ok: false;
      /** The piece that could not be read, verbatim. */
      raw: string;
      /** Why, in the words a surface may show. */
      reason: string;
    };

/** The addr-spec shape `normalizeMediumValue` and the DB CHECK both enforce. */
const ADDR_SPEC = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/**
 * Split an address field into its mailboxes, honouring quotes and angle
 * brackets: a comma inside `"Doe, John"` is part of the name, not a separator.
 */
export function splitMailboxField(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngles = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"' && !inAngles) {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && char === "<") inAngles = true;
    if (!inQuotes && char === ">") inAngles = false;
    if (!inQuotes && !inAngles && (char === "," || char === ";")) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function unquote(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const inner =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1
      ? trimmed.slice(1, -1)
      : trimmed;
  const cleaned = inner.replace(/\\(.)/g, "$1").trim();
  return cleaned || null;
}

/** Read ONE mailbox: `a@b.com`, `Name <a@b.com>` or `"Last, First" <a@b.com>`. */
export function parseMailbox(raw: string): ParsedMailbox | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const angle = /^(.*)<([^<>]*)>$/s.exec(trimmed);
  if (angle) {
    const address = angle[2].trim().toLocaleLowerCase();
    if (!ADDR_SPEC.test(address)) return null;
    return { address, displayName: unquote(angle[1]), raw: trimmed };
  }
  // A bare addr-spec, and nothing else: `Ada ada@example.com` (no brackets) is
  // genuinely ambiguous, so it is refused rather than guessed at.
  const bare = trimmed.toLocaleLowerCase();
  if (!ADDR_SPEC.test(bare)) return null;
  return { address: bare, displayName: null, raw: trimmed };
}

/**
 * Parse a whole To/Cc field. Every mailbox must be readable: one unreadable
 * piece fails the WHOLE field, because a partial read of a recipient list is
 * how an address nobody checked reaches a person's inbox.
 */
export function parseMailboxField(raw: string): MailboxFieldParse {
  const pieces = splitMailboxField(raw ?? "");
  const mailboxes: ParsedMailbox[] = [];
  for (const piece of pieces) {
    const mailbox = parseMailbox(piece);
    if (!mailbox) {
      return {
        ok: false,
        raw: piece,
        reason: `"${piece}" is not an email address this can read.`,
      };
    }
    mailboxes.push(mailbox);
  }
  return { ok: true, mailboxes };
}

/**
 * Parse several fields (To, then each Cc) into one deduplicated recipient set.
 *
 * Dedup is on the addr-spec, so `Ada <ada@example.com>` and `ADA@example.com`
 * are one recipient asked about once — while the display form is kept for the
 * sentence a person reads.
 */
export function parseRecipientFields(fields: string[]): MailboxFieldParse {
  const seen = new Set<string>();
  const mailboxes: ParsedMailbox[] = [];
  for (const field of fields) {
    if (!field || !field.trim()) continue;
    const parsed = parseMailboxField(field);
    if (!parsed.ok) return parsed;
    for (const mailbox of parsed.mailboxes) {
      if (seen.has(mailbox.address)) continue;
      seen.add(mailbox.address);
      mailboxes.push(mailbox);
    }
  }
  return { ok: true, mailboxes };
}

/** The addr-spec of a single written address, or null when it cannot be read. */
export function addressOfMailbox(raw: string): string | null {
  return parseMailbox(raw)?.address ?? null;
}
