import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { PlatformComment as Comment } from "@ai-matrx/associations";
import { readInboundClassification } from "@/features/crm/inbox/attributes";
import { MEDIUM_BLOCK_LABELS, mediumBlocks } from "@/features/crm/reachability";
import type {
  AddressRow,
  AffiliationWithEmployer,
  AffiliationWithPerson,
  ContactPoint,
  InteractionRow,
  PartyListRow,
} from "@/features/crm/types";

export interface CrmRecordCopyParent {
  id: string;
  label: string;
  type: "party";
}

interface NamedValue {
  id: string;
  name: string;
}

function display(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parentContext(parent: CrmRecordCopyParent) {
  return {
    record_type: parent.type,
    record_id: parent.id,
    record_label: parent.label,
  };
}

export function buildIdentityCopyView(input: {
  party: PartyListRow;
  lifecycleStage: NamedValue | null;
  rating: NamedValue | null;
  roles: NamedValue[];
}) {
  const { party, lifecycleStage, rating, roles } = input;
  return {
    name: party.display_name,
    kind: party.party_kind,
    first_name: party.first_name,
    last_name: party.last_name,
    title: party.job_title,
    headline: party.headline,
    legal_name: party.legal_name,
    domain: party.primary_domain,
    timezone: party.timezone,
    bio: party.bio,
    lifecycle_stage: lifecycleStage?.name ?? null,
    rating: rating?.name ?? null,
    roles: roles.map((role) => role.name),
    do_not_contact: party.do_not_contact,
  };
}

export type IdentityCopyView = ReturnType<typeof buildIdentityCopyView>;

export function formatIdentityCopy(view: IdentityCopyView): string {
  const lines = [
    `Identity — ${view.name}`,
    `Type: ${titleCase(view.kind)}`,
    `First name: ${display(view.first_name)}`,
    `Last name: ${display(view.last_name)}`,
    `Title: ${display(view.title)}`,
    `Headline: ${display(view.headline)}`,
    `Legal name: ${display(view.legal_name)}`,
    `Domain: ${display(view.domain)}`,
    `Timezone: ${display(view.timezone)}`,
    `Stage: ${display(view.lifecycle_stage)}`,
    `Rating: ${display(view.rating)}`,
    `Roles: ${view.roles.length ? view.roles.join(", ") : "—"}`,
    `Do not contact: ${view.do_not_contact ? "Yes" : "No"}`,
  ];
  if (view.bio) lines.push(`Bio:\n${view.bio}`);
  return lines.join("\n");
}

export function identityAgentPayload(
  parent: CrmRecordCopyParent,
  view: IdentityCopyView,
): AgentPayloadInput {
  return {
    kind: "crm-record-identity",
    location: "CRM record — Identity",
    description: `The identity details visible for ${parent.label}.`,
    data: view,
    summary: formatIdentityCopy(view),
    attributes: { record_id: parent.id, record_kind: view.kind },
    context: parentContext(parent),
  };
}

export function buildContactPointCopyView(point: ContactPoint) {
  const blocks = mediumBlocks(point.medium);
  return {
    channel: point.channel,
    value: point.medium.display_value ?? point.medium.value_raw,
    label: point.label,
    purpose: point.purpose_code,
    is_primary: Boolean(point.is_primary),
    status:
      blocks.length === 0
        ? "Available"
        : blocks.map((block) => MEDIUM_BLOCK_LABELS[block]).join(" · "),
  };
}

export type ContactPointCopyView = ReturnType<typeof buildContactPointCopyView>;

export function formatContactPointsCopy(
  parent: CrmRecordCopyParent,
  views: ContactPointCopyView[],
): string {
  if (views.length === 0) return `Contact methods — ${parent.label}\nNone`;
  return [
    `Contact methods — ${parent.label}`,
    ...views.map(
      (view) =>
        `${titleCase(view.channel ?? "other")}${view.is_primary ? " (Primary)" : ""}: ${view.value}` +
        `${view.label ? `\nLabel: ${view.label}` : ""}` +
        `${view.purpose ? `\nPurpose: ${titleCase(view.purpose)}` : ""}` +
        `\nStatus: ${view.status}`,
    ),
  ].join("\n\n");
}

export function contactPointsAgentPayload(
  parent: CrmRecordCopyParent,
  views: ContactPointCopyView[],
): AgentPayloadInput {
  return {
    kind: "crm-record-contact-methods",
    location: "CRM record — Contact",
    description: `The contact methods and visible deliverability states for ${parent.label}.`,
    data: views,
    summary: formatContactPointsCopy(parent, views),
    attributes: { record_id: parent.id, count: views.length },
    context: parentContext(parent),
  };
}

export function formatAddress(address: AddressRow): string {
  return [
    address.line1,
    address.line2,
    [address.locality, address.region].filter(Boolean).join(", "),
    address.postal_code,
    address.country_code,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildAddressCopyView(address: AddressRow) {
  return {
    purpose: address.purpose_code,
    label: address.label,
    address: formatAddress(address) || "—",
  };
}

export type AddressCopyView = ReturnType<typeof buildAddressCopyView>;

export function formatAddressesCopy(
  parent: CrmRecordCopyParent,
  views: AddressCopyView[],
): string {
  if (views.length === 0) return `Addresses — ${parent.label}\nNone`;
  return [
    `Addresses — ${parent.label}`,
    ...views.map(
      (view) =>
        `${titleCase(view.purpose ?? "other")}${view.label ? ` — ${view.label}` : ""}\n${view.address}`,
    ),
  ].join("\n\n");
}

export function addressesAgentPayload(
  parent: CrmRecordCopyParent,
  views: AddressCopyView[],
): AgentPayloadInput {
  return {
    kind: "crm-record-addresses",
    location: "CRM record — Addresses",
    description: `The addresses visible for ${parent.label}.`,
    data: views,
    summary: formatAddressesCopy(parent, views),
    attributes: { record_id: parent.id, count: views.length },
    context: parentContext(parent),
  };
}

export function stintDates(
  startDate: string | null,
  endDate: string | null,
): string {
  const start = startDate ? startDate.slice(0, 7) : "?";
  const end = endDate ? endDate.slice(0, 7) : "now";
  return `${start} → ${end}`;
}

export function buildEmploymentCopyViews(
  input:
    | { mode: "person"; rows: AffiliationWithEmployer[] }
    | { mode: "company"; rows: AffiliationWithPerson[] },
) {
  if (input.mode === "person") {
    return input.rows.map((row) => ({
      name: row.employer?.display_name ?? "Unknown company",
      title: row.title,
      dates: stintDates(row.start_date, row.end_date),
      status: row.is_current ? "Current" : "Past",
    }));
  }
  return input.rows.map((row) => ({
    name: row.person?.display_name ?? "Unknown person",
    title: row.title,
    dates: stintDates(row.start_date, row.end_date),
    status: row.is_current ? "Current" : "Past",
  }));
}

export type EmploymentCopyView = ReturnType<
  typeof buildEmploymentCopyViews
>[number];

export function formatEmploymentCopy(
  parent: CrmRecordCopyParent,
  mode: "person" | "company",
  views: EmploymentCopyView[],
): string {
  const title = mode === "person" ? "Employment" : "People";
  if (views.length === 0) return `${title} — ${parent.label}\nNone`;
  return [
    `${title} — ${parent.label}`,
    ...views.map(
      (view) =>
        `${view.name}${view.title ? ` — ${view.title}` : ""}\n${view.dates} · ${view.status}`,
    ),
  ].join("\n\n");
}

export function employmentAgentPayload(
  parent: CrmRecordCopyParent,
  mode: "person" | "company",
  views: EmploymentCopyView[],
): AgentPayloadInput {
  const label = mode === "person" ? "employment history" : "people history";
  return {
    kind: mode === "person" ? "crm-record-employment" : "crm-record-people",
    location: `CRM record — ${mode === "person" ? "Employment" : "People"}`,
    description: `The ${label} visible for ${parent.label}.`,
    data: views,
    summary: formatEmploymentCopy(parent, mode, views),
    attributes: { record_id: parent.id, count: views.length },
    context: parentContext(parent),
  };
}

export function buildInteractionCopyView(row: InteractionRow) {
  const classification =
    row.direction === "inbound"
      ? readInboundClassification(row.attributes)
      : null;
  return {
    subject: row.subject || titleCase(row.channel_code),
    channel: row.channel_code,
    direction: row.direction,
    occurred_at: row.occurred_at ?? row.created_at,
    duration_minutes:
      row.duration_seconds == null
        ? null
        : Math.round(row.duration_seconds / 60),
    body: row.body,
    classification: classification?.rawLabel ?? null,
    classification_evidence: classification?.evidence ?? null,
  };
}

export type InteractionCopyView = ReturnType<typeof buildInteractionCopyView>;

export function formatInteractionCopy(view: InteractionCopyView): string {
  return [
    `${titleCase(view.channel)} — ${view.subject}`,
    `Direction: ${titleCase(view.direction)}`,
    `When: ${view.occurred_at}`,
    view.duration_minutes == null
      ? null
      : `Duration: ${view.duration_minutes} minutes`,
    view.classification ? `Classification: ${view.classification}` : null,
    view.classification_evidence
      ? `Evidence: ${view.classification_evidence}`
      : null,
    view.body ? `\n${view.body}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function interactionAgentPayload(
  parent: CrmRecordCopyParent,
  row: InteractionRow,
  view: InteractionCopyView,
): AgentPayloadInput {
  return {
    kind: "crm-record-activity-item",
    location: "CRM record — Activity",
    description: `One activity item visible on ${parent.label}.`,
    data: view,
    summary: formatInteractionCopy(view),
    attributes: {
      record_id: parent.id,
      interaction_id: row.id,
      channel: view.channel,
      direction: view.direction,
    },
    context: { ...parentContext(parent), interaction_id: row.id },
  };
}

export function formatInteractionsCopy(
  parent: CrmRecordCopyParent,
  views: InteractionCopyView[],
  includeBodies = true,
): string {
  if (views.length === 0) return `Activity — ${parent.label}\nNone`;
  return [
    `Activity — ${parent.label}`,
    ...views.map((view) =>
      formatInteractionCopy(includeBodies ? view : { ...view, body: null }),
    ),
  ].join("\n\n---\n\n");
}

export function interactionsAgentPayload(
  parent: CrmRecordCopyParent,
  views: InteractionCopyView[],
  includeBodies = true,
): AgentPayloadInput {
  const data = includeBodies
    ? views
    : views.map((view) => ({ ...view, body: null }));
  return {
    kind: "crm-record-activity",
    location: "CRM record — Activity",
    description: `${includeBodies ? "All visible activity details" : "An activity overview"} for ${parent.label}.`,
    data,
    summary: formatInteractionsCopy(parent, views, includeBodies),
    attributes: {
      record_id: parent.id,
      count: views.length,
      includes_bodies: includeBodies,
    },
    context: parentContext(parent),
  };
}

export function buildNoteCopyView(comment: Comment) {
  return {
    author:
      comment.author.displayName ?? comment.author.email ?? "Unknown author",
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
    body: comment.body,
  };
}

export type NoteCopyView = ReturnType<typeof buildNoteCopyView>;

export function formatNoteCopy(view: NoteCopyView): string {
  return `${view.author} · ${view.created_at}\n\n${view.body}`;
}

export function noteAgentPayload(
  parent: CrmRecordCopyParent,
  comment: Comment,
  view: NoteCopyView,
): AgentPayloadInput {
  return {
    kind: "crm-record-note",
    location: "CRM record — Notes",
    description: `One note visible on ${parent.label}.`,
    data: view,
    summary: formatNoteCopy(view),
    attributes: { record_id: parent.id, note_id: comment.id },
    context: { ...parentContext(parent), note_id: comment.id },
  };
}

export function formatNotesCopy(
  parent: CrmRecordCopyParent,
  views: NoteCopyView[],
  includeBodies = true,
): string {
  if (views.length === 0) return `Notes — ${parent.label}\nNone`;
  return [
    `Notes — ${parent.label}`,
    ...views.map((view) =>
      includeBodies
        ? formatNoteCopy(view)
        : `${view.author} · ${view.created_at}`,
    ),
  ].join("\n\n---\n\n");
}

export function notesAgentPayload(
  parent: CrmRecordCopyParent,
  views: NoteCopyView[],
  includeBodies = true,
): AgentPayloadInput {
  const data = includeBodies
    ? views
    : views.map(({ author, created_at, updated_at }) => ({
        author,
        created_at,
        updated_at,
      }));
  return {
    kind: "crm-record-notes",
    location: "CRM record — Notes",
    description: `${includeBodies ? "All visible notes" : "A notes overview"} for ${parent.label}.`,
    data,
    summary: formatNotesCopy(parent, views, includeBodies),
    attributes: {
      record_id: parent.id,
      count: views.length,
      includes_bodies: includeBodies,
    },
    context: parentContext(parent),
  };
}
