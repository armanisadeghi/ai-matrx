// features/crm/compliance/parse.ts
//
// Narrows the jsonb verdict from crm.check_send_eligibility into a real
// EligibilityVerdict — at runtime, honestly, with no cast.
//
// Why this file exists rather than `data as EligibilityVerdict`: a compliance
// verdict is the one value in the system that must never fail open. A cast
// asserts a shape the compiler cannot check, so a function-signature change in
// the DB would surface as `verdict.allowed === undefined` — falsy, which happens
// to be safe here, and `verdict.blocks.map` throwing at render time, which is
// not. Parsing means a shape mismatch is a loud, immediate error at the boundary
// where it can still be understood.
//
// TYPESCRIPT_STANDARDS.md §3/§4: narrow honestly at the boundary.

import { isJsonArray, isJsonObject, type JsonValue } from "@/types/json";
import type {
  ColdVerdict,
  ConsentBasis,
  EligibilityBlock,
  EligibilityBlockCode,
  EligibilityVerdict,
  EligibilityWarning,
  OutreachLane,
  SubscriberKind,
} from "./types";

function str(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function parseBlocks(value: JsonValue | undefined): EligibilityBlock[] {
  if (!isJsonArray(value)) return [];
  const out: EligibilityBlock[] = [];
  for (const entry of value) {
    if (!isJsonObject(entry)) continue;
    const code = str(entry.code);
    const message = str(entry.message);
    if (!code || !message) continue;
    out.push({
      // The DB is the authority on this union; an unrecognised code from a newer
      // migration must still render, so we accept the string and let the
      // exhaustive union in types.ts guide callers rather than gate them.
      code: code as EligibilityBlockCode,
      message,
      fix: str(entry.fix) ?? "",
    });
  }
  return out;
}

function parseWarnings(value: JsonValue | undefined): EligibilityWarning[] {
  if (!isJsonArray(value)) return [];
  const out: EligibilityWarning[] = [];
  for (const entry of value) {
    if (!isJsonObject(entry)) continue;
    const code = str(entry.code);
    const message = str(entry.message);
    if (code && message) out.push({ code, message });
  }
  return out;
}

const LANES: ReadonlySet<string> = new Set(["cold_outreach", "opt_in_marketing"]);
const CONFIDENCES: ReadonlySet<string> = new Set(["high", "medium", "none"]);
const COLD_VERDICTS: ReadonlySet<string> = new Set([
  "allowed",
  "conditional",
  "prohibited",
  "unknown",
]);
const SUBSCRIBER_KINDS: ReadonlySet<string> = new Set([
  "individual",
  "corporate",
  "unknown",
]);
const CONSENT_BASES: ReadonlySet<string> = new Set([
  "express",
  "implied_ebr",
  "implied_inquiry",
  "conspicuous_publication",
  "legitimate_interest",
  "soft_opt_in",
  "none",
]);

/**
 * Throws if the payload is not a verdict. Callers must let that propagate —
 * swallowing it and continuing would mean sending on an unknown verdict, which
 * is precisely the failure this whole module exists to prevent.
 */
export function parseEligibilityVerdict(payload: unknown): EligibilityVerdict {
  if (!isJsonObject(payload)) {
    throw new Error("Eligibility verdict was not an object");
  }
  if (typeof payload.allowed !== "boolean") {
    throw new Error("Eligibility verdict is missing `allowed`");
  }

  const lane = str(payload.lane);
  const resolvedRaw = isJsonObject(payload.resolved) ? payload.resolved : {};

  const confidence = str(resolvedRaw.confidence);
  const coldVerdict = str(resolvedRaw.jurisdiction_verdict);
  const basis = str(resolvedRaw.consent_basis);
  const subscriberKind = str(resolvedRaw.subscriber_kind);

  return {
    allowed: payload.allowed,
    lane: lane && LANES.has(lane) ? (lane as OutreachLane) : "cold_outreach",
    blocks: parseBlocks(payload.blocks),
    warnings: parseWarnings(payload.warnings),
    resolved: {
      jurisdiction: str(resolvedRaw.jurisdiction),
      confidence:
        confidence && CONFIDENCES.has(confidence)
          ? (confidence as "high" | "medium" | "none")
          : "none",
      method: str(resolvedRaw.method) ?? "unresolved",
      jurisdiction_verdict:
        coldVerdict && COLD_VERDICTS.has(coldVerdict)
          ? (coldVerdict as ColdVerdict)
          : null,
      // Absent means NOT ratified. Never default this to true.
      jurisdiction_ratified: resolvedRaw.jurisdiction_ratified === true,
      consent_basis:
        basis && CONSENT_BASES.has(basis) ? (basis as ConsentBasis) : "none",
      subscriber_kind:
        subscriberKind && SUBSCRIBER_KINDS.has(subscriberKind)
          ? (subscriberKind as SubscriberKind)
          : "unknown",
    },
  };
}
