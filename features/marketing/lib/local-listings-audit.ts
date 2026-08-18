import type {
  BusinessLocation,
  ListingMatrixRow,
  ListingPublisher,
  LocationListing,
} from "@/features/marketing/types";
import { PRESENT_LISTING_STATUSES, isListingStatus } from "@/features/marketing/types";

/**
 * NAP consistency + citation coverage engine (pure, no I/O).
 *
 * The expert reflex this encodes: local rank is driven by (1) being present on
 * the publishers that matter, weighted by their real citation impact, and
 * (2) the Name/Address/Phone on every listing agreeing EXACTLY with the
 * canonical profile — near-misses ("St" vs "Street", formatting-only phone
 * differences) are fine; real mismatches (old address, wrong phone) actively
 * hurt. Verdicts are per-field and human-readable, never a bare number.
 */

export type NapField = "name" | "street_address" | "locality" | "region" | "postal_code" | "phone" | "website_url";

export type NapFieldVerdict = {
  field: NapField;
  verdict: "match" | "mismatch" | "missing_observed" | "not_in_profile";
  canonical: string | null;
  observed: string | null;
};

export interface ListingNapAudit {
  verdicts: NapFieldVerdict[];
  /** 0-100 over the comparable fields; null when nothing was comparable. */
  score: number | null;
  mismatches: NapFieldVerdict[];
}

/** Uppercase, collapse whitespace, strip punctuation — formatting never counts as a mismatch. */
export function normalizeNapText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toUpperCase()
    .replace(/[.,#'’\-\/–—&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STREET_SYNONYMS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  DRIVE: "DR",
  ROAD: "RD",
  LANE: "LN",
  COURT: "CT",
  PLACE: "PL",
  SUITE: "STE",
  HIGHWAY: "HWY",
  PARKWAY: "PKWY",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
};

export function normalizeStreetAddress(value: string | null | undefined): string {
  return normalizeNapText(value)
    .split(" ")
    .map((word) => STREET_SYNONYMS[word] ?? word)
    .join(" ");
}

/** Digits only; a canonical E.164 US number and "(555) 123-4567" compare equal. */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  // Strip a leading country code 1 so +1 555 123 4567 == (555) 123-4567.
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeWebsiteUrl(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

const FIELD_NORMALIZERS: Record<NapField, (value: string | null | undefined) => string> = {
  name: normalizeNapText,
  street_address: normalizeStreetAddress,
  locality: normalizeNapText,
  region: normalizeNapText,
  postal_code: (value) => normalizeNapText(value).replace(/\s/g, "").slice(0, 5),
  phone: normalizePhone,
  website_url: normalizeWebsiteUrl,
};

function observedText(observed: unknown, field: NapField): string | null {
  if (typeof observed !== "object" || observed === null || Array.isArray(observed)) return null;
  const value = (observed as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function canonicalText(location: BusinessLocation, field: NapField): string | null {
  const value = location[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Compare one listing's observed payload against the canonical profile.
 * `observed` is web.location_listing.observed: a flat record keyed by NapField.
 */
export function auditListingNap(location: BusinessLocation, observed: unknown): ListingNapAudit {
  const verdicts: NapFieldVerdict[] = (Object.keys(FIELD_NORMALIZERS) as NapField[]).map((field) => {
    const canonical = canonicalText(location, field);
    const observedValue = observedText(observed, field);
    if (!canonical) {
      return { field, verdict: "not_in_profile", canonical: null, observed: observedValue };
    }
    if (!observedValue) {
      return { field, verdict: "missing_observed", canonical, observed: null };
    }
    const normalize = FIELD_NORMALIZERS[field];
    return {
      field,
      verdict: normalize(canonical) === normalize(observedValue) ? "match" : "mismatch",
      canonical,
      observed: observedValue,
    };
  });

  const comparable = verdicts.filter((v) => v.verdict === "match" || v.verdict === "mismatch");
  const matches = comparable.filter((v) => v.verdict === "match").length;
  return {
    verdicts,
    score: comparable.length === 0 ? null : Math.round((matches / comparable.length) * 100),
    mismatches: verdicts.filter((v) => v.verdict === "mismatch"),
  };
}

export interface CitationCoverage {
  /** 0-100: citation_weight-weighted share of publishers where a presence exists. */
  score: number;
  presentCount: number;
  totalPublishers: number;
  /** Publishers with no presence, most impactful first — the work list. */
  missing: ListingPublisher[];
  /** Listings that exist but need attention (needs_update / duplicate / rejected). */
  attention: { publisher: ListingPublisher; listing: LocationListing }[];
}

export function computeCitationCoverage(matrix: ListingMatrixRow[]): CitationCoverage {
  let earned = 0;
  let possible = 0;
  let presentCount = 0;
  const missing: ListingPublisher[] = [];
  const attention: CitationCoverage["attention"] = [];

  for (const { publisher, listing } of matrix) {
    const weight = publisher.citation_weight ?? 0;
    possible += weight;
    const status = listing && isListingStatus(listing.status) ? listing.status : "unknown";
    const present = listing !== null && PRESENT_LISTING_STATUSES.includes(status);
    if (present) {
      earned += weight;
      presentCount += 1;
      if (listing && (status === "needs_update" || status === "duplicate")) {
        attention.push({ publisher, listing });
      }
    } else {
      if (listing && (status === "rejected" || status === "submitted")) {
        attention.push({ publisher, listing });
      }
      missing.push(publisher);
    }
  }

  missing.sort((a, b) => (b.citation_weight ?? 0) - (a.citation_weight ?? 0));
  return {
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    presentCount,
    totalPublishers: matrix.length,
    missing,
    attention,
  };
}

export type ProfileFieldGap = { field: string; label: string; why: string };

/** Profile completeness: what the canonical record is missing before submissions can go out. */
export function findProfileGaps(location: BusinessLocation): ProfileFieldGap[] {
  const gaps: ProfileFieldGap[] = [];
  const need = (condition: boolean, field: string, label: string, why: string) => {
    if (condition) gaps.push({ field, label, why });
  };
  need(!location.street_address, "street_address", "Street address", "Every publisher requires a street address.");
  need(!location.locality, "locality", "City", "Required by every publisher.");
  need(!location.region, "region", "State / region", "Required by every publisher.");
  need(!location.postal_code, "postal_code", "Postal code", "Required by every publisher.");
  need(!location.phone, "phone", "Phone", "The P in NAP — listings without one rank worse and get claimed by others.");
  need(!location.website_url, "website_url", "Website URL", "Links every citation back to the site being ranked.");
  need(!location.business_type, "business_type", "Business type", "Drives the schema.org LocalBusiness subtype and publisher categories.");
  need(location.categories.length === 0, "categories", "Categories", "Publishers rank you inside categories; empty means they guess.");
  need(
    !Array.isArray(location.opening_hours) || location.opening_hours.length === 0,
    "opening_hours",
    "Opening hours",
    "Profiles with hours convert and rank measurably better on Google and Apple.",
  );
  need(location.latitude === null || location.longitude === null, "latitude", "Map coordinates", "Pins the location on Google/Apple/Bing maps.");
  need(!location.description, "description", "Description", "The canonical long description publishers display.");
  return gaps;
}
