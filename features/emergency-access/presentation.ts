// features/emergency-access/presentation.ts
//
// Turning stored door values into the words on the screen — and ONLY the words
// this client owns. The doors' own `message` sentences are never touched here.

import { format } from "date-fns";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

/**
 * What kind of record a token names, per `platform.entity_types` — the same
 * registry every other surface reads. An unregistered token shows as itself:
 * a raw token is a true fact, "Unknown" is not.
 */
export function recordKindLabel(token: string | null): string {
  if (!token) return "A record";
  return tryGetEntityInfo(token)?.label ?? token;
}

/** A purpose slug as words, for a row read long after the picker is gone. */
export function purposeLabel(purpose: string | null): string {
  if (!purpose) return "No reason recorded";
  return purpose.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** An absolute timestamp — the audit is read years later, so never "3d ago". */
export function whenLabel(iso: string | null): string {
  if (!iso) return "Time not recorded";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return format(at, "PPp");
}

/** "expires" vs "expired", decided against the clock at render time. */
export function keyWindowLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "No key was issued";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.getTime() > now.getTime()
    ? `Key expires ${format(at, "PPp")}`
    : `Key expired ${format(at, "PPp")}`;
}

/** "lapses" vs "lapsed", for a pending request's own deadline. */
export function requestWindowLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "No deadline recorded";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.getTime() > now.getTime()
    ? `Lapses ${format(at, "PPp")}`
    : `Lapsed ${format(at, "PPp")}`;
}

// ── THE OUTCOME OF ONE AUDIT ROW ────────────────────────────────────────────
//
// 🚨 `granted` ALONE DOES NOT SAY WHAT HAPPENED, and reading it as if it did is
// how the subject's own page told a person that a request which was APPROVED
// had been refused, with the fabricated reason "No reason recorded" (V-38,
// 2026-09-12). The door writes FIVE actions and only one of them is a refusal:
//
//   requested → an ask is in flight; nothing is open yet, nothing was refused
//   approved  → the second person said yes; the key exists       (granted=true)
//   read      → a `confidential` record opened on one admin's word (granted=true)
//   denied    → actually refused                                 (granted=false)
//   expired   → the ask lapsed with nobody answering it          (granted=false)
//
// `requested` and `expired` both carry `granted=false` and neither is a
// refusal. The action is the authority; `granted` only separates the two rows
// that could be either.

import type { AccessLogEntry } from "./types";

export type AccessLogOutcome =
  | "granted"
  | "refused"
  | "asked"
  | "lapsed"
  | "notice_failed";

export function accessLogOutcome(entry: AccessLogEntry): AccessLogOutcome {
  switch (entry.action) {
    case "requested":
      return "asked";
    case "denied":
      return "refused";
    case "expired":
      return "lapsed";
    case "notice_failed":
      return "notice_failed";
    case "approved":
    case "read":
      // These two ARE decided by `granted` — an approval path can still end in
      // a refusal row carrying the same action in a future revision.
      return entry.granted ? "granted" : "refused";
    default:
      // An action this client has never heard of must not be guessed into a red
      // REFUSED box. Fall back to the flag, which is at least what the database
      // recorded, and never to a reason nobody wrote.
      return entry.granted ? "granted" : "asked";
  }
}

/** Does this row describe something that actually OPENED? */
export function accessWasOpened(entry: AccessLogEntry): boolean {
  return accessLogOutcome(entry) === "granted";
}

/**
 * WHO HELD THE KEY — the answer the page exists to give.
 *
 * Never the actor on a two-person approval: that is the person who said yes.
 * When the grantee is genuinely unrecoverable the page says so in words rather
 * than naming the nearest available person.
 */
export function keyHolderLabel(entry: AccessLogEntry): string {
  return (
    entry.granteeLabel ??
    entry.granteeUserId ??
    "Someone we can no longer name"
  );
}

/**
 * WHO SAID YES — shown only when it is a different person from the key holder,
 * because "admin approved it for test" is the whole truth of the two-person
 * path and "admin opened it" was the lie.
 */
export function authorisedByLabel(entry: AccessLogEntry): string | null {
  const actor = entry.actorLabel ?? entry.actorUserId;
  if (!actor) return null;
  const holder = entry.granteeLabel ?? entry.granteeUserId;
  if (holder && actor === holder) return null;
  return actor;
}

/** The verb for one row, in the subject's own terms. */
export function accessLogVerb(outcome: AccessLogOutcome): string {
  switch (outcome) {
    case "granted":
      return "opened";
    case "refused":
      return "was refused access to";
    case "asked":
      return "asked to open";
    case "lapsed":
      return "asked to open (and nobody answered)";
    case "notice_failed":
      return "opened — and we could not deliver your notice about";
  }
}

/** The badge word for one row. */
export function accessLogBadge(outcome: AccessLogOutcome): string {
  switch (outcome) {
    case "granted":
      return "Opened";
    case "refused":
      return "Refused";
    case "asked":
      return "Asked";
    case "lapsed":
      return "Lapsed";
    case "notice_failed":
      return "Notice failed";
  }
}
