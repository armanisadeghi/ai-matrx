/**
 * Platform-owned organizations.
 *
 * NO NULL ORG (Arman's ruling, 2026-08-21 — common-docs
 * systems/platform/db-rules/FEATURE.md §2 / §6e):
 *
 *   "If something belongs to the system, that CANNOT EVER be represented by a
 *    NULL org! ... NO NULL ORG. the system has an org and this is
 *    well-established."
 *
 * So there is no `organization_id: null` tier and never a `.is("organization_id",
 * null)` filter. Platform-global content is owned by the `matrx-system` org,
 * which `iam.system_orgs` marks `global_readable` — the flag `iam.has_access`
 * reads to serve those rows to every authenticated user (at visibility
 * >= 'internal'; 'public' additionally reaches anon through `pub_read`).
 *
 * This id is stable and seeded; it is a constant rather than a lookup so that
 * "which org means global" has exactly one answer in the client bundle.
 */
export const SYSTEM_ORGANIZATION_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

/** Slug of the same org — for the server routes that resolve it by slug. */
export const SYSTEM_ORGANIZATION_SLUG = "matrx-system";
