/**
 * Deterministic parse of a highlighted fragment into contact fields.
 *
 * Pure, synchronous, no network — it runs the instant the user right-clicks so
 * the review dialog opens ALREADY FILLED IN. The agent that actually saves the
 * record (slot `crm.save_contact`) receives this as `hints` and corrects it
 * against the raw selection; nothing here is trusted as final, and the user
 * sees and can edit every field before anything is written.
 *
 * Why deterministic first: an email signature is a solved parsing problem, and
 * showing the user a filled form beats showing them a spinner while a model
 * reads four lines of text. The model earns its keep on the ambiguous cases
 * (which line is the title, which is the company, is this a person at all).
 *
 * Contact-value normalization is NOT duplicated here — `normalizeMediumValue`
 * in `features/crm/normalize.ts` is the one canonical normalizer (and the twin of
 * the server's `canonicalize.py`). This module only DETECTS candidates.
 */

import { normalizeMediumValue } from "../normalize";
import type { ContactChannel, PartyKind } from "../types";

/**
 * `normalizeMediumValue` THROWS on a value it cannot normalize — correct for a
 * save path, wrong for a detector scanning arbitrary highlighted text. This is
 * the detector's tolerant reading of the SAME canonical normalizer; it never
 * reimplements the rules, it just declines to crash on prose.
 */
function normalizedOrEmpty(channel: ContactChannel, raw: string): string {
  try {
    return normalizeMediumValue(channel, raw).valueKey;
  } catch {
    return "";
  }
}

export interface ParsedContactSelection {
  /** Best guess at the display name. Empty when no name was found. */
  name: string;
  kind: PartyKind;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Company web domain — only ever set for organization guesses. */
  domain: string;
  /** Title / role line, e.g. "VP of Engineering, Acme Robotics". */
  headline: string;
}

export const EMPTY_PARSED_CONTACT: ParsedContactSelection = {
  name: "",
  kind: "person",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  domain: "",
  headline: "",
};

/** Beyond this, the fragment is prose, not a contact. Keeps the menu honest. */
const MAX_SELECTION_CHARS = 4000;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Deliberately loose: any run of 7+ digits with common separators. The real
// verdict comes from `normalizeMediumValue`, which rejects what it can't dial.
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i;

/** Words that mean a line is chrome, not a name. */
const NOISE_LINE =
  /^(best|thanks|regards|sincerely|cheers|sent from|from|to|cc|bcc|subject|date|on .* wrote|--+|__+)\b/i;

/** Legal suffixes that make a line a COMPANY rather than a person. */
const COMPANY_MARKER =
  /\b(inc|inc\.|llc|l\.l\.c\.|ltd|ltd\.|limited|gmbh|corp|corp\.|corporation|co\.|company|plc|s\.a\.|b\.v\.|pty|group|holdings|partners|associates|labs|studios|technologies|solutions)\b/i;

/** Titles/roles — a line with one of these is a headline, not a name. */
const TITLE_MARKER =
  /\b(ceo|cto|coo|cfo|cmo|founder|co-founder|president|vp|vice president|director|head of|manager|engineer|developer|designer|analyst|consultant|partner|associate|attorney|counsel|professor|dr\.|md|phd|rn|specialist|coordinator|lead|architect|scientist|researcher|editor|writer|producer|owner|principal)\b/i;

function cleanLines(selection: string): string[] {
  return selection
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Does this line read like a human name? Conservative on purpose. */
function looksLikePersonName(line: string): boolean {
  if (NOISE_LINE.test(line)) return false;
  if (COMPANY_MARKER.test(line)) return false;
  if (TITLE_MARKER.test(line)) return false;
  if (EMAIL_RE.test(line) || PHONE_RE.test(line)) return false;
  const words = line.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  // Two-to-five capitalized-ish words, no sentence punctuation.
  if (/[.!?;:]$/.test(line)) return false;
  return words.every((w) => /^[A-Z(]/.test(w) || /^[A-Z]/.test(w.slice(1)));
}

/**
 * Derive a name from an email local part when the text gave us nothing —
 * `jane.cole@acme.com` → "Jane Cole". Only for dotted/underscored/hyphenated
 * local parts of 2+ tokens; `info@` or `jcole@` stay empty rather than invent.
 */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter((p) => /^[a-z]{2,}$/i.test(p));
  if (parts.length < 2) return "";
  return parts
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

/** Public/free mail hosts are never a company's identifying domain. */
const FREE_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "msn.com",
]);

/**
 * Parse a highlighted fragment. Never throws; an unparseable fragment simply
 * comes back with an empty `name`, which is how callers know there is nothing
 * to offer.
 */
export function parseContactSelection(
  selection: string,
): ParsedContactSelection {
  const text = (selection ?? "").trim();
  if (!text || text.length > MAX_SELECTION_CHARS) {
    return { ...EMPTY_PARSED_CONTACT };
  }

  const lines = cleanLines(text);
  const emailMatch = text.match(EMAIL_RE);
  const email = emailMatch ? normalizedOrEmpty("email", emailMatch[0]) : "";

  const phoneMatch = text.match(PHONE_RE);
  const phone = phoneMatch ? normalizedOrEmpty("phone", phoneMatch[1]) : "";

  const nameLine = lines.find(looksLikePersonName) ?? "";
  const companyLine =
    lines.find((l) => COMPANY_MARKER.test(l) && !EMAIL_RE.test(l)) ?? "";
  const titleLine =
    lines.find((l) => TITLE_MARKER.test(l) && l !== nameLine) ?? "";

  // A company record only when there is a company line and NO person name —
  // "Jane Cole / Acme Inc." is a person who works at Acme, not two records.
  const kind: PartyKind = !nameLine && companyLine ? "organization" : "person";

  let name = kind === "organization" ? companyLine : nameLine;
  if (!name && email) name = nameFromEmail(email);

  // Domain: an explicit URL first, else the email host — but never a free-mail
  // host, and never on a person record (domain is a company identity key).
  let domain = "";
  if (kind === "organization") {
    // Emails are removed BEFORE the URL scan: `acme.team@gmail.com` otherwise
    // yields the domain "acme.team" from the LOCAL PART, which is not a
    // website at all (caught by parseContactSelection.test.ts).
    const urlMatch = text.replace(new RegExp(EMAIL_RE, "g"), " ").match(URL_RE);
    const fromUrl = urlMatch?.[1]?.toLowerCase() ?? "";
    const fromEmail = email.split("@")[1]?.toLowerCase() ?? "";
    const candidate = fromUrl || fromEmail;
    if (candidate && !FREE_MAIL_HOSTS.has(candidate)) domain = candidate;
  }

  let firstName = "";
  let lastName = "";
  if (kind === "person" && name) {
    const words = name.split(" ").filter(Boolean);
    if (words.length >= 2) {
      firstName = words[0];
      lastName = words[words.length - 1];
    } else {
      firstName = name;
    }
  }

  return {
    name,
    kind,
    firstName,
    lastName,
    email,
    phone,
    domain,
    headline: kind === "person" ? titleLine : "",
  };
}

/**
 * Is this fragment worth offering "Save as contact" on?
 *
 * The menu is not a place to advertise an action that cannot work, and it is
 * not a place to hide one the user clearly wants: any name, email or phone
 * qualifies. Prose with none of the three does not.
 */
export function looksLikeContact(selection: string): boolean {
  const parsed = parseContactSelection(selection);
  return Boolean(parsed.name || parsed.email || parsed.phone);
}
