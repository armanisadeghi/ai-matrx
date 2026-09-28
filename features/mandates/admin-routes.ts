// features/mandates/admin-routes.ts
//
// THE admin addresses of the mandate pages. Mandates are a Feature of the
// Intelligence Domain (Arman, 2026-09-25 — never under Agents), so every
// admin mandate page lives at /administration/intelligence/mandates/**. The
// retired /administration/mandates/** addresses only redirect here
// (next.config.js); `pnpm check:retired-admin-mandate-links` keeps anything
// from linking to them again.
//
// Every href to a mandate admin page is built here. Never hand-build one.

export const ADMIN_MANDATES_HOME = "/administration/intelligence/mandates";

/** ONE mandate on the new record page. */
export function adminMandateRecordHref(mandateKey: string): string {
  return `${ADMIN_MANDATES_HOME}/${encodeURIComponent(mandateKey)}`;
}

/** The simple Overrides page for one mandate, at the system level. */
export function adminMandateOverridesHref(mandateKey: string): string {
  return `${adminMandateRecordHref(mandateKey)}/overrides`;
}

/**
 * MANDATE SUPPORT LOOKUP (Arman, 2026-09-26) — a SEPARATE admin route for
 * looking into an organization's or a person's mandates while doing tech
 * support. The management list above shows system mandates only. A tenant
 * mandate's key can repeat across organizations, so its record opens by id.
 */
export const ADMIN_MANDATES_SUPPORT = `${ADMIN_MANDATES_HOME}/support`;

/** ONE organization's or person's mandate, opened from the support lookup. */
export function adminMandateSupportRecordHref(mandateId: string): string {
  return `${ADMIN_MANDATES_SUPPORT}/${encodeURIComponent(mandateId)}`;
}

export const ADMIN_MANDATES_DASHBOARD = `${ADMIN_MANDATES_HOME}/dashboard`;
export const ADMIN_MANDATES_HEALTH = `${ADMIN_MANDATES_HOME}/health`;
export const ADMIN_MANDATES_UNCONVERTED = `${ADMIN_MANDATES_HOME}/unconverted`;
export const ADMIN_MANDATES_WINDOW = `${ADMIN_MANDATES_HOME}/window`;

/** Create a mandate before its intelligence exists. */
export const ADMIN_MANDATES_NEW = `${ADMIN_MANDATES_HOME}/new`;
/** Raw rows of the mandate tables, full CRUD, no guardrails. */
export const ADMIN_MANDATES_RAW_TABLES = `${ADMIN_MANDATES_HOME}/advanced`;
/** Per repository: last complete scan, open findings, the conversion list. */
export const ADMIN_MANDATES_REFERENCES = `${ADMIN_MANDATES_HOME}/references`;
