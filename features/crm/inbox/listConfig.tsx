"use client";

// features/crm/inbox/listConfig.tsx
//
// /crm/inbox expressed as an entity-list config — the THIRD consumer of the
// generic shell (lib/entity-list), after /agents/all and /transcripts.
//
// D9: this is a VIEW over crm.interaction. No new table, no new inbox model,
// no bespoke list shell.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { INBOX_COLUMNS } from "./columns";
import {
  fetchInboxFacets,
  fetchInboxListPage,
  fetchInboxScopeCounts,
} from "./service";
import { useInboxRowActions } from "./useInboxRowActions";
import {
  INBOX_LIST_SCOPES,
  inboxRowHref,
  type InboxRow,
} from "./types";

export const inboxListConfig: EntityListConfig<InboxRow> = {
  surfaceKey: "crm-inbox",
  // DD-137c / §3.3: NO registryToken on purpose. `crm.interaction` is a registered COMPONENT, and
  // db-rules §6d-1 says a component's access IS its parent's — so it carries no
  // `default_list_scope` of its own (F-20 leaves it NULL deliberately). Naming it here would make
  // `resolveListScope` announce a missing registration on every page load and land on `mine`
  // anyway. The inbox keeps its own default until the parent it belongs to is the thing declared.
  entityLabel: { singular: "reply", plural: "replies" },
  sourceFeature: "crm",
  scopes: INBOX_LIST_SCOPES,
  service: {
    fetchPage: fetchInboxListPage,
    fetchCounts: fetchInboxScopeCounts,
    fetchFacets: fetchInboxFacets,
  },
  columns: INBOX_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => `${row.party_name ?? "Contact"} — ${row.subject}`,
  getRowAgentContext: (row) => `Reply ${row.id}`,
  /**
   * THE DOOR LAW: a reply's destination is the PERSON, not the interaction.
   * crm.interaction is a component of party and has no route of its own, so
   * linking the row to its own id would be a door to nowhere.
   */
  door: { hrefFor: inboxRowHref },
  /**
   * The row IS a party for the right-click menu's Attach To. Deliberately no
   * `resourceType`: sharing is a party-level act performed on the record page,
   * and offering Share on a reply row would target a permission on the
   * interaction, which is not a shareable resource.
   */
  getRowEntity: (row) =>
    row.party_id
      ? { type: "party", id: row.party_id, title: row.party_name ?? "Contact" }
      : undefined,
  useRowActions: useInboxRowActions,
  // crm.interaction has no favorite and no archived axis — the shell hides
  // both affordances rather than rendering a lie.
  supportsArchived: false,
  deepSearch: { label: "Also search the full message body" },
  facetSections: [
    {
      facet: "classification",
      filterId: "classification",
      label: "What they said",
      noneLabel: "Unclassified",
      countInLabel: false,
    },
    {
      facet: "handled",
      filterId: "handled",
      label: "State",
      noneLabel: "Unknown",
      countInLabel: false,
    },
    {
      facet: "outreach_list_name",
      filterId: "outreach_list_name",
      label: "Campaign",
      noneLabel: "Not from a campaign",
    },
    {
      facet: "sending_identity_label",
      filterId: "sending_identity_label",
      label: "Sent from",
      noneLabel: "No mailbox",
      minOptions: 2,
    },
    {
      facet: "step",
      filterId: "step",
      label: "Step",
      noneLabel: "No matching step",
      countInLabel: false,
    },
    {
      facet: "member_status",
      filterId: "member_status",
      label: "Member state",
      noneLabel: "Not a member",
      minOptions: 2,
    },
    {
      facet: "channel",
      filterId: "channel",
      label: "Channel",
      noneLabel: "Unknown",
      minOptions: 2,
      countInLabel: false,
    },
  ],
  noneLabels: {
    classification: "Unclassified",
    outreach_list_name: "Not from a campaign",
    sending_identity_label: "No mailbox",
    member_status: "Not a member",
    organization_name: "No organization",
    step: "No matching step",
  },
  copy: {
    label: "Reply",
    listLabel: "Outreach inbox",
    location: "/crm/inbox",
    rowKind: "outreach-reply",
    listKind: "outreach-inbox",
    rowDescription:
      "An opaque reference to one inbox interaction. Message content stays local until immutable provenance permits model transfer.",
    listDescription:
      "Opaque references and counts for the currently visible outreach inbox.",
    // The table package also embeds `humanRow` as an agent summary. Keep this
    // projection opaque; the visible table cells still render the full local
    // inbox row.
    humanRow: (row) => `Reply ${row.id}`,
    agentRow: (row) => ({ id: row.id }),
    rowAttributes: (row) => ({
      id: row.id,
    }),
    listAttributes: (visible, all) => ({
      rows: visible.length,
      rows_loaded: all.length,
      rows_total: all[0]?.total_count ?? visible.length,
    }),
  },
  emptyState: {
    title: "No replies yet",
    description:
      "Every inbound reply to your outreach lands here with the campaign, the step it answers and the record that motivated it. Nothing has come back yet.",
  },
};
