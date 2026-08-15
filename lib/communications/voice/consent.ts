/** Provider-neutral affirmative call-consent evidence. No persistence lives here. */

import { createHash } from "node:crypto";

export type CallConsentResponseKind =
  | "dtmf"
  | "speech"
  | "continued_after_disclosure";
export type CallConsentSource = "twiml" | "conversation_relay";

export interface CallConsentEvidence {
  provider: string;
  providerAccountId: string;
  providerCallId: string;
  providerEventKey: string;
  programKey: string;
  disclosureVersion: string;
  disclosureTextHash: string;
  disclosedAt: string;
  responseKind: CallConsentResponseKind;
  responseValue: string;
  consented: true;
  consentedAt: string;
  source: CallConsentSource;
}

export interface CreateCallConsentEvidenceInput {
  provider: string;
  providerAccountId: string;
  providerCallId: string;
  providerEventKey: string;
  programKey: string;
  disclosureVersion: string;
  disclosureText: string;
  disclosedAt: string;
  responseKind: CallConsentResponseKind;
  responseValue: string;
  consentedAt: string;
  source: CallConsentSource;
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requireIsoTimestamp(value: string, label: string): string {
  const normalized = requireNonEmpty(value, label);
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

export function callDisclosureTextHash(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/** Build evidence only after an explicit affirmative response has been proven. */
export function createCallConsentEvidence(
  input: CreateCallConsentEvidenceInput,
): CallConsentEvidence {
  const disclosedAt = requireIsoTimestamp(input.disclosedAt, "disclosedAt");
  const consentedAt = requireIsoTimestamp(input.consentedAt, "consentedAt");
  if (Date.parse(consentedAt) < Date.parse(disclosedAt)) {
    throw new Error("consentedAt cannot precede disclosedAt");
  }
  return {
    provider: requireNonEmpty(input.provider, "provider"),
    providerAccountId: requireNonEmpty(
      input.providerAccountId,
      "providerAccountId",
    ),
    providerCallId: requireNonEmpty(input.providerCallId, "providerCallId"),
    providerEventKey: requireNonEmpty(input.providerEventKey, "providerEventKey"),
    programKey: requireNonEmpty(input.programKey, "programKey"),
    disclosureVersion: requireNonEmpty(
      input.disclosureVersion,
      "disclosureVersion",
    ),
    disclosureTextHash: callDisclosureTextHash(
      requireNonEmpty(input.disclosureText, "disclosureText"),
    ),
    disclosedAt,
    responseKind: input.responseKind,
    responseValue: requireNonEmpty(input.responseValue, "responseValue"),
    consented: true,
    consentedAt,
    source: input.source,
  };
}

/** A signed action context is usable only for the same call and a fresh disclosure. */
export function isFreshCallDisclosure(input: {
  disclosedAt: string;
  now: string;
  maxAgeMs: number;
}): boolean {
  const disclosedAt = Date.parse(input.disclosedAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(disclosedAt) || !Number.isFinite(now)) return false;
  const age = now - disclosedAt;
  return age >= 0 && age <= input.maxAgeMs;
}
