// features/crm/inbox/types.ts
//
// The unified outreach inbox: one row = one INBOUND crm.interaction, in full
// context. Row shapes derive from the generated RPC return type — never
// hand-mirrored (CLAUDE.md § Types).
//
// D9: this is a VIEW over crm.interaction + crm.outreach_list_member. There is
// no inbox table and there must never be one.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** One row, exactly as crm_inbox_list_scoped returns it. */
export type InboxRow =
  Database["public"]["Functions"]["crm_inbox_list_scoped"]["Returns"][number];

/**
 * Mine + My Orgs, and deliberately no more.
 *
 * An interaction is private business data: it carries no `visibility` axis, and
 * CRM still has no grant-reader RPC (features/crm/FEATURE.md § Not built yet).
 * Rendering a Shared / Industry / Public tab here would be a tab that can only
 * ever say zero — a lie the fixed-five vocabulary does not require us to tell.
 * A surface declares a SUBSET; it never invents a sixth scope.
 */
export const INBOX_LIST_SCOPES: ListScopeKind[] = ["mine", "orgs"];

/** The record page a reply belongs to. */
export function inboxPartyHref(row: InboxRow): string | undefined {
  return row.party_id ? `/crm/${row.party_id}` : undefined;
}

/** The campaign the reply came out of. */
export function inboxCampaignHref(row: InboxRow): string | undefined {
  return row.outreach_list_id
    ? `/crm/outreach-lists/${row.outreach_list_id}`
    : undefined;
}

/**
 * The motivating record — why we wrote to this person at all.
 * Both live under a brand + site, so the href is only offered when the RPC
 * resolved the whole path. Never render an id you cannot open.
 */
export function inboxReputationCaseHref(row: InboxRow): string | undefined {
  if (!row.reputation_case_brand_id || !row.reputation_case_site_id) return undefined;
  return `/marketing/brands/${row.reputation_case_brand_id}/sites/${row.reputation_case_site_id}/reputation`;
}

export function inboxBacklinkHref(row: InboxRow): string | undefined {
  if (!row.backlink_brand_id || !row.backlink_site_id) return undefined;
  return `/marketing/brands/${row.backlink_brand_id}/sites/${row.backlink_site_id}/backlinks`;
}

/** The row's primary destination: the person who replied. */
export function inboxRowHref(row: InboxRow): string | undefined {
  return inboxPartyHref(row);
}
