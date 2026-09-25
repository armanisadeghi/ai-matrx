// features/mandates/member-list/routes.ts
//
// Where the non-admin mandate pages live. The user pages sit beside the
// owner's /mandates and /mandates/<key> (untouched); the organization pages are
// new routes beside /organizations/<org>/settings/mandates (untouched).

import type { MandateListLevel } from "./types";

export const PERSON_MANDATE_LIST_HREF = "/mandates/list-preview";

export function personMandateRecordHref(mandateKey: string, tab?: string): string {
  const base = `/mandates/record-preview/${encodeURIComponent(mandateKey)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

export function orgMandateListHref(orgId: string): string {
  return `/organizations/${encodeURIComponent(orgId)}/mandates`;
}

export function orgMandateRecordHref(orgId: string, mandateKey: string, tab?: string): string {
  const base = `${orgMandateListHref(orgId)}/${encodeURIComponent(mandateKey)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

/** The create page for a level. */
export function newSoftMandateHref(level: MandateListLevel, orgId?: string | null): string {
  return level === "organization" && orgId
    ? `${orgMandateListHref(orgId)}/new`
    : "/mandates/new-preview";
}

/** One record href for a level — the list, peek and create flow all read this. */
export function memberMandateRecordHref(
  level: MandateListLevel,
  mandateKey: string,
  orgId?: string | null,
  tab?: string,
): string {
  return level === "organization" && orgId
    ? orgMandateRecordHref(orgId, mandateKey, tab)
    : personMandateRecordHref(mandateKey, tab);
}

/** The list href for a level. */
export function memberMandateListHref(level: MandateListLevel, orgId?: string | null): string {
  return level === "organization" && orgId ? orgMandateListHref(orgId) : PERSON_MANDATE_LIST_HREF;
}
