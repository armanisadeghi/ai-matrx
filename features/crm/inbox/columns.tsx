"use client";

// features/crm/inbox/columns.tsx
//
// The INBOX column registry for the canonical entity list.
//
// APP POLICY, no exceptions: every column sorts AND filters, server-side, over
// the whole result set. Finite sets get real options with counts from
// crm_inbox_list_facets; the numeric Step column filters by bucket
// (public.crm_step_matches in SQL); dates filter by relative bucket.
//
// THE DOOR LAW runs through this file: the person, the employer, the campaign,
// the mailbox and the motivating record are each rendered AND linked. Nothing
// here prints a name (or an id) the user cannot reach.

import { Building2, CircleCheck, CircleDot, Mail } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import {
  InboundLabelBadge,
  MemberStatusBadge,
} from "@/features/crm/components/outreach-lists/badges";
import {
  inboxBacklinkHref,
  inboxReputationCaseHref,
  type InboxRow,
} from "./types";

const STEP_FILTER_OPTIONS = [
  { value: "1", label: "Step 1" },
  { value: "2", label: "Step 2" },
  { value: "3", label: "Step 3" },
  { value: "gt3", label: "Step 4+" },
  { value: "__none__", label: "No matching step" },
];

const HANDLED_FILTER_OPTIONS = [
  { value: "false", label: "Needs me" },
  { value: "true", label: "Handled" },
];

const CHANNEL_FILTER_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "call", label: "Call" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

export const INBOX_COLUMNS: EntityColumnSpec<InboxRow>[] = [
  {
    id: "party_name",
    label: "Who replied",
    locked: true,
    column: {
      id: "party_name",
      accessorKey: "party_name",
      header: "Who replied",
      filter: "text",
      width: 210,
      // THE DOOR LAW through the shell: `entityToken` turns the name into an
      // EntityRef, so it carries Open + new tab + peek from the registries.
      // entityId is REQUIRED here: the table's getRowId is the INTERACTION id,
      // so the default would peek/open the wrong record entirely.
      entityToken: (row) => (row.party_id ? "party" : undefined),
      entityId: (row) => row.party_id ?? undefined,
      href: (row) => (row.party_id ? `/crm/${row.party_id}` : undefined),
      cell: (row) => (
        <span className="truncate font-medium">
          {row.party_name ?? "Unknown contact"}
        </span>
      ),
    },
  },
  {
    id: "classification",
    label: "What they said",
    locked: true,
    facet: "classification",
    column: {
      id: "classification",
      accessorKey: "classification",
      header: "What they said",
      filter: "select",
      width: 130,
      cell: (row) => <InboundLabelBadge value={row.classification} />,
    },
  },
  {
    id: "subject",
    label: "Subject",
    column: {
      id: "subject",
      accessorKey: "subject",
      header: "Subject",
      filter: "text",
      width: 240,
      className: "max-w-[15rem] overflow-hidden",
      cell: (row) => (
        <span className="block truncate" title={row.subject}>
          {row.subject}
        </span>
      ),
    },
  },
  {
    id: "snippet",
    label: "Message",
    column: {
      id: "snippet",
      accessorKey: "snippet",
      header: "Message",
      filter: "text",
      width: 300,
      className: "max-w-[19rem] overflow-hidden",
      cell: (row) =>
        row.snippet?.trim() ? (
          <span
            className="block truncate text-muted-foreground"
            title={row.snippet}
          >
            {row.snippet}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "occurred",
    label: "Replied",
    column: {
      id: "occurred",
      accessorKey: "occurred_at",
      header: "Replied",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 110,
      align: "right",
      cell: (row) => timeCell(row.occurred_at),
    },
  },
  {
    id: "handled",
    label: "State",
    column: {
      id: "handled",
      accessorKey: "handled",
      header: "State",
      filter: "select",
      filterOptions: HANDLED_FILTER_OPTIONS,
      width: 110,
      cell: (row) =>
        row.handled ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            Handled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <CircleDot className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            Needs me
          </span>
        ),
    },
  },
  {
    id: "outreach_list_name",
    label: "Campaign",
    facet: "outreach_list_name",
    column: {
      id: "outreach_list_name",
      accessorKey: "outreach_list_name",
      header: "Campaign",
      filter: "select",
      width: 200,
      // A campaign named here opens there — the reply is meaningless without
      // the queue it came out of.
      entityToken: (row) => (row.outreach_list_id ? "crm_outreach_list" : undefined),
      entityId: (row) => row.outreach_list_id ?? undefined,
      href: (row) =>
        row.outreach_list_id
          ? `/crm/outreach-lists/${row.outreach_list_id}`
          : undefined,
      cell: (row) =>
        row.outreach_list_name ? (
          <span className="truncate">{row.outreach_list_name}</span>
        ) : (
          <Muted>Not from a campaign</Muted>
        ),
    },
  },
  {
    id: "step",
    label: "Step",
    facet: "step",
    column: {
      id: "step",
      accessorKey: "step",
      header: "Step",
      filter: "select",
      filterOptions: STEP_FILTER_OPTIONS,
      width: 80,
      align: "right",
      cell: (row) =>
        row.step != null ? (
          <span
            className="tabular-nums text-muted-foreground"
            title={
              row.outbound_subject
                ? `Replying to: ${row.outbound_subject}`
                : undefined
            }
          >
            {row.step}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "member_status",
    label: "Member",
    facet: "member_status",
    defaultHidden: true,
    column: {
      id: "member_status",
      accessorKey: "member_status",
      header: "Member",
      filter: "select",
      width: 130,
      cell: (row) =>
        row.member_status ? (
          <MemberStatusBadge status={row.member_status} />
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "employer_name",
    label: "Outlet / employer",
    column: {
      id: "employer_name",
      accessorKey: "employer_name",
      header: "Outlet / employer",
      filter: "text",
      width: 180,
      cell: (row) =>
        row.employer_id && row.employer_name ? (
          <EntityRef
            token="party"
            id={row.employer_id}
            name={row.employer_name}
            showIcon={false}
            className="truncate"
          />
        ) : row.employer_name ? (
          <span className="flex items-center gap-1.5 truncate text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden />
            {row.employer_name}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "why",
    label: "Why we wrote",
    // The MOTIVATING RECORD, as a door rather than an id — the reason we wrote
    // to this person at all. Filters and sorts server-side over
    // coalesce(case label, backlink label), like every other column.
    defaultHidden: true,
    column: {
      id: "why",
      accessorKey: "reputation_case_label",
      header: "Why we wrote",
      filter: "text",
      width: 220,
      cell: (row) => {
        const caseHref = inboxReputationCaseHref(row);
        const backlinkHref = inboxBacklinkHref(row);
        if (row.reputation_case_label && caseHref) {
          return (
            <a
              href={caseHref}
              className="truncate text-primary underline-offset-2 hover:underline"
              onClick={(event) => event.stopPropagation()}
              title={row.reputation_case_label}
            >
              {row.reputation_case_label}
            </a>
          );
        }
        if (row.backlink_label && backlinkHref) {
          return (
            <a
              href={backlinkHref}
              className="truncate text-primary underline-offset-2 hover:underline"
              onClick={(event) => event.stopPropagation()}
              title={row.backlink_label}
            >
              {row.backlink_label}
            </a>
          );
        }
        // Never render an id you cannot open: when the record exists but its
        // brand/site could not be resolved, say the label plainly and offer no
        // fake link.
        const label = row.reputation_case_label ?? row.backlink_label;
        return label ? (
          <span className="truncate text-muted-foreground" title={label}>
            {label}
          </span>
        ) : (
          <Muted>—</Muted>
        );
      },
    },
  },
  {
    id: "sending_identity_label",
    label: "Sent from",
    facet: "sending_identity_label",
    defaultHidden: true,
    column: {
      id: "sending_identity_label",
      accessorKey: "sending_identity_label",
      header: "Sent from",
      filter: "select",
      width: 190,
      entityToken: (row) =>
        row.sending_identity_id ? "crm_sending_identity" : undefined,
      entityId: (row) => row.sending_identity_id ?? undefined,
      href: (row) =>
        row.sending_identity_id
          ? `/crm/sending-identities/${row.sending_identity_id}`
          : undefined,
      cell: (row) =>
        row.sending_identity_label ? (
          <span className="flex items-center gap-1.5 truncate text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
            {row.sending_identity_label}
          </span>
        ) : (
          <Muted>No mailbox attached</Muted>
        ),
    },
  },
  {
    id: "channel",
    label: "Channel",
    facet: "channel",
    defaultHidden: true,
    column: {
      id: "channel",
      accessorKey: "channel_code",
      header: "Channel",
      filter: "select",
      filterOptions: CHANNEL_FILTER_OPTIONS,
      width: 100,
      cell: (row) => (
        <span className="text-xs capitalize text-muted-foreground">
          {row.channel_code}
        </span>
      ),
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    facet: "organization_name",
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      width: 170,
      cell: (row) =>
        row.organization_name ? (
          <span className="flex items-center gap-1.5 truncate text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden />
            {row.organization_name}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "created",
    label: "Ingested",
    defaultHidden: true,
    column: {
      id: "created",
      accessorKey: "created_at",
      header: "Ingested",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 110,
      align: "right",
      cell: (row) => timeCell(row.created_at),
    },
  },
];
