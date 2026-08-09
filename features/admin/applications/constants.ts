// features/admin/applications/constants.ts
//
// Shared constants for the Applications admin hub (/administration/applications)
// — the single surface governing OUR shipped client applications (desktop,
// extension, mobile): remote configuration, remote catalogs, the installed
// fleet, and a unified audit history.
//
// Naming: "Applications" here means shipped Matrx clients. The word "app" is
// reserved product-wide for user-created agent apps — never label anything in
// this hub "Apps".

/** Copy-for-AI provenance location shared by every table in the hub. */
export const APPLICATIONS_ADMIN_LOCATION = "/administration/applications";

/** The application every surface in this hub defaults to. */
export const DEFAULT_APPLICATION = "matrx-local";

// ─── Record routes (THE DOOR LAW) ───────────────────────────────────────────
// Every record this hub names must be openable, and the history timeline names
// records that live on the Configuration and Catalogs tabs. Both tabs read
// these params server-side and open straight onto the record, so the links are
// real doors — not "here's the tab, go find it".

/** Open one application's remote configuration editor. */
export const applicationConfigHref = (app: string) =>
  `${APPLICATIONS_ADMIN_LOCATION}/configuration?app=${encodeURIComponent(app)}`;

/** Open one catalog entry's editor (app + kind pick the table it lives in). */
export const catalogEntryHref = (app: string, kind: string, entryId: string) =>
  `${APPLICATIONS_ADMIN_LOCATION}/catalogs?app=${encodeURIComponent(app)}` +
  `&kind=${encodeURIComponent(kind)}&entry=${encodeURIComponent(entryId)}`;

/** Open one catalog kind's entry table. */
export const catalogKindHref = (app: string, kind: string) =>
  `${APPLICATIONS_ADMIN_LOCATION}/catalogs?app=${encodeURIComponent(app)}` +
  `&kind=${encodeURIComponent(kind)}`;
