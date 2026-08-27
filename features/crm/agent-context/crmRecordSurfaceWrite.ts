import { isUuid } from "@/features/scopes/service/associationGuards";
import { isJsonObject, type JsonObject } from "@/types/json";
import {
  ADDRESS_PURPOSES,
  CONTACT_PURPOSES,
  CRM_RECORD_ADDABLE_CONTACT_CHANNELS,
  INTERACTION_CHANNELS,
  INTERACTION_DIRECTIONS,
  type AddressPurpose,
  type ContactPurpose,
  type CrmRecordAddableContactChannel,
  type InteractionChannel,
  type InteractionDirection,
  type PartyUpdate,
} from "../types";

function objectValue(target: string, value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`${target} expects an object.`);
  }
  return value;
}

function rejectUnknownKeys(
  target: string,
  value: JsonObject,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${target} does not accept: ${unknown.join(", ")}. Accepted keys: ${allowed.join(", ")}.`,
    );
  }
}

function optionalText(
  target: string,
  field: string,
  value: unknown,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${target}.${field} expects a string or null.`);
  }
  return value.trim() || null;
}

function optionalBoolean(
  target: string,
  field: string,
  value: unknown,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${target}.${field} expects a boolean.`);
  }
  return value;
}

function option<T extends string>(
  target: string,
  field: string,
  value: unknown,
  options: readonly T[],
): T {
  const match = options.find((candidate) => candidate === value);
  if (!match) {
    throw new Error(
      `${target}.${field} expects one of: ${options.join(" | ")}.`,
    );
  }
  return match;
}

function optionalDate(
  target: string,
  field: string,
  value: unknown,
): string | null | undefined {
  const text = optionalText(target, field, value);
  if (text === undefined || text === null) return text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${target}.${field} expects YYYY-MM-DD or null.`);
  }
  return text;
}

const IDENTITY_FIELDS = [
  "display_name",
  "first_name",
  "last_name",
  "job_title",
  "headline",
  "legal_name",
  "primary_domain",
  "timezone",
  "bio",
] as const;

export function parseIdentityFields(value: unknown): PartyUpdate {
  const target = "identity_fields";
  const input = objectValue(target, value);
  rejectUnknownKeys(target, input, IDENTITY_FIELDS);
  if (Object.keys(input).length === 0) {
    throw new Error(`${target} expects at least one editable field.`);
  }

  const patch: PartyUpdate = {};
  for (const field of IDENTITY_FIELDS) {
    const next = optionalText(target, field, input[field]);
    if (next === undefined) continue;
    if (field === "display_name") {
      if (!next)
        throw new Error("identity_fields.display_name cannot be empty.");
      patch.display_name = next;
      continue;
    }
    patch[field] = next;
  }
  return patch;
}

export interface ParsedContactPoint {
  channel: CrmRecordAddableContactChannel;
  value: string;
  label?: string;
  purpose?: ContactPurpose;
  makePrimary?: boolean;
}

export function parseContactPoint(value: unknown): ParsedContactPoint {
  const target = "add_contact_point";
  const input = objectValue(target, value);
  rejectUnknownKeys(target, input, [
    "channel",
    "value",
    "label",
    "purpose",
    "make_primary",
  ]);
  const channel = option(
    target,
    "channel",
    input.channel,
    CRM_RECORD_ADDABLE_CONTACT_CHANNELS,
  );
  const contactValue = optionalText(target, "value", input.value);
  if (!contactValue)
    throw new Error("add_contact_point.value cannot be empty.");
  const label = optionalText(target, "label", input.label) ?? undefined;
  const purpose =
    input.purpose === undefined
      ? undefined
      : option(target, "purpose", input.purpose, CONTACT_PURPOSES);
  const makePrimary = optionalBoolean(
    target,
    "make_primary",
    input.make_primary,
  );
  return { channel, value: contactValue, label, purpose, makePrimary };
}

export interface ParsedAddress {
  purpose: AddressPurpose;
  label: string | null;
  line1: string | null;
  line2: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

export function parseAddress(value: unknown): ParsedAddress {
  const target = "add_address";
  const input = objectValue(target, value);
  rejectUnknownKeys(target, input, [
    "purpose",
    "label",
    "line1",
    "line2",
    "locality",
    "region",
    "postal_code",
    "country_code",
  ]);
  const purpose = option(target, "purpose", input.purpose, ADDRESS_PURPOSES);
  const line1 = optionalText(target, "line1", input.line1) ?? null;
  const locality = optionalText(target, "locality", input.locality) ?? null;
  if (!line1 && !locality) {
    throw new Error("add_address requires at least line1 or locality.");
  }
  const countryCode =
    optionalText(target, "country_code", input.country_code)?.toUpperCase() ??
    null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("add_address.country_code expects a two-letter code.");
  }
  return {
    purpose,
    label: optionalText(target, "label", input.label) ?? null,
    line1,
    line2: optionalText(target, "line2", input.line2) ?? null,
    locality,
    region: optionalText(target, "region", input.region) ?? null,
    postalCode: optionalText(target, "postal_code", input.postal_code) ?? null,
    countryCode,
  };
}

export interface ParsedEmployment {
  employerPartyId: string;
  title?: string;
  department?: string;
  startDate?: string | null;
  isCurrent?: boolean;
  isPrimary?: boolean;
}

export function parseEmployment(value: unknown): ParsedEmployment {
  const target = "add_employment";
  const input = objectValue(target, value);
  rejectUnknownKeys(target, input, [
    "employer_party_id",
    "title",
    "department",
    "start_date",
    "is_current",
    "is_primary",
  ]);
  if (!isUuid(input.employer_party_id)) {
    throw new Error("add_employment.employer_party_id expects a UUID.");
  }
  return {
    employerPartyId: input.employer_party_id,
    title: optionalText(target, "title", input.title) ?? undefined,
    department:
      optionalText(target, "department", input.department) ?? undefined,
    startDate: optionalDate(target, "start_date", input.start_date),
    isCurrent: optionalBoolean(target, "is_current", input.is_current),
    isPrimary: optionalBoolean(target, "is_primary", input.is_primary),
  };
}

export interface ParsedInteraction {
  channel: InteractionChannel;
  direction: InteractionDirection;
  subject?: string;
  body?: string;
  durationSeconds?: number;
  occurredAt?: string;
}

export function parseInteraction(value: unknown): ParsedInteraction {
  const target = "log_interaction";
  const input = objectValue(target, value);
  rejectUnknownKeys(target, input, [
    "channel",
    "direction",
    "subject",
    "body",
    "duration_seconds",
    "occurred_at",
  ]);
  const subject = optionalText(target, "subject", input.subject) ?? undefined;
  const body = optionalText(target, "body", input.body) ?? undefined;
  if (!subject && !body) {
    throw new Error("log_interaction requires a subject or body.");
  }
  let durationSeconds: number | undefined;
  if (input.duration_seconds !== undefined) {
    if (
      typeof input.duration_seconds !== "number" ||
      !Number.isFinite(input.duration_seconds) ||
      input.duration_seconds < 0
    ) {
      throw new Error(
        "log_interaction.duration_seconds expects a non-negative number.",
      );
    }
    durationSeconds = input.duration_seconds;
  }
  let occurredAt: string | undefined;
  if (input.occurred_at !== undefined) {
    if (
      typeof input.occurred_at !== "string" ||
      Number.isNaN(Date.parse(input.occurred_at))
    ) {
      throw new Error("log_interaction.occurred_at expects an ISO timestamp.");
    }
    occurredAt = input.occurred_at;
  }
  return {
    channel: option(target, "channel", input.channel, INTERACTION_CHANNELS),
    direction: option(
      target,
      "direction",
      input.direction,
      INTERACTION_DIRECTIONS,
    ),
    subject,
    body,
    durationSeconds,
    occurredAt,
  };
}
