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
