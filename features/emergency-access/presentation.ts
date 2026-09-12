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
