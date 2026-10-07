// features/esign/signing/fieldMap.ts — the placed fields a signer sees on the document.
//
// The sender places Signature / Initials / Date / Name boxes on PDF pages; the load answer carries
// them per document as `field_map = { fields: [{ id, signer_id, kind, page, x, y, w, h }] }` (`{}`
// when none). Coordinates are FRACTIONS of the page, origin top-left, page 1-based. Everything a
// field shows is derived from what the signer adopts — nothing here is typed into a field.
//
// `documents[]` arrives as `{[key]: unknown}` rows, so the map is read by checking every value,
// never by casting: a malformed field is dropped, the rest still draw.

export type FieldKind = "signature" | "initials" | "date_signed" | "full_name";

export interface PlacedField {
  id: string;
  signerId: string;
  kind: FieldKind;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const KINDS: readonly FieldKind[] = ["signature", "initials", "date_signed", "full_name"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fraction(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** The fields placed on one document, in reading order (page, then top to bottom, then left). */
export function readFieldMap(document: Record<string, unknown> | null | undefined): PlacedField[] {
  const map = document?.field_map;
  if (!isRecord(map) || !Array.isArray(map.fields)) return [];
  const out: PlacedField[] = [];
  for (const raw of map.fields) {
    if (!isRecord(raw)) continue;
    const kind = KINDS.find((k) => k === raw.kind);
    const page = raw.page;
    const x = fraction(raw.x);
    const y = fraction(raw.y);
    const w = fraction(raw.w);
    const h = fraction(raw.h);
    if (
      !kind ||
      typeof raw.id !== "string" ||
      typeof raw.signer_id !== "string" ||
      typeof page !== "number" ||
      !Number.isInteger(page) ||
      page < 1 ||
      x === null ||
      y === null ||
      !w ||
      !h
    ) {
      continue;
    }
    out.push({ id: raw.id, signerId: raw.signer_id, kind, page, x, y, w, h });
  }
  return out.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

/**
 * True when this page cannot draw a document's fields faithfully: a v2 map (`schema_version: 2`,
 * esign-parity CONTRACT §1.3) or any field whose kind this v1 reader does not know. The surface
 * then refuses openly ("This document needs the new signing page") instead of drawing the
 * document with fields missing — a signer must never sign past a field they were never shown.
 */
export function needsNewSigningPage(document: Record<string, unknown> | null | undefined): boolean {
  const map = document?.field_map;
  if (!isRecord(map)) return false;
  if (map.schema_version !== undefined && map.schema_version !== 1) return true;
  if (!Array.isArray(map.fields)) return false;
  return map.fields.some((raw) => !isRecord(raw) || !KINDS.some((k) => k === raw.kind));
}

/** "Mary Ann van Dyke" → "MAVD"; at most four letters, from the full name the signer adopted. */
export function initialsOf(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

/** The date a field shows: today, in the signer's own locale. */
export function signingDate(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** The words on an empty field of the signer's own, where DocuSign says "Sign here". */
export const FIELD_PROMPT: Record<FieldKind, string> = {
  signature: "Sign here",
  initials: "Initial",
  date_signed: "Date",
  full_name: "Name",
};

/** The name of a field's kind, for another signer's muted box and for screen readers. */
export const FIELD_LABEL: Record<FieldKind, string> = {
  signature: "Signature",
  initials: "Initials",
  date_signed: "Date signed",
  full_name: "Full name",
};

/**
 * Where a field sits once the viewer has rotated the page (clockwise, in degrees). The stored
 * fractions describe the page as drawn unrotated; the overlay box is the rotated page.
 */
export function rotateBox(
  box: Pick<PlacedField, "x" | "y" | "w" | "h">,
  rotation: number,
): Pick<PlacedField, "x" | "y" | "w" | "h"> {
  const turn = (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const { x, y, w, h } = box;
  if (turn === 90) return { x: 1 - (y + h), y: x, w: h, h: w };
  if (turn === 180) return { x: 1 - (x + w), y: 1 - (y + h), w, h };
  if (turn === 270) return { x: y, y: 1 - (x + w), w: h, h: w };
  return { x, y, w, h };
}

/**
 * THE PAPER PALETTE. A field sits on the document, and the document is always printed paper —
 * white in dark mode too — so its colours are fixed, never theme tokens (a token flips to light
 * text on the white page in dark mode). `ink` is the stamped signed copy's own ink
 * (aidream services/esign/signed_copy.py INK), so what a signer sees is what gets printed.
 */
export const PAPER = {
  paper: "#ffffff",
  ink: "#0d2673",
  mine: "#2563eb",
  mineFill: "rgba(37, 99, 235, 0.12)",
  mineFilled: "rgba(37, 99, 235, 0.05)",
  otherFill: "rgba(100, 116, 139, 0.12)",
  otherBorder: "#94a3b8",
  otherText: "#475569",
  signedFill: "rgba(22, 163, 74, 0.08)",
  signedBorder: "#16a34a",
  signedText: "#166534",
} as const;
