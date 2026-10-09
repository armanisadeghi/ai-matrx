import type { Json } from "@/types/database.types";

/**
 * The ONE readable text for a business fact's jsonb `value`.
 *
 * A fact's value is written either as a plain string or as a structured jsonb
 * document: an Address fact carries schema.org PostalAddress fields, possibly
 * wrapped as `{ "address": { "@type": "PostalAddress", … } }`. The Overview
 * used to render every record it did not recognise as raw JSON, so a person saw
 * `{"address":{"@type":"PostalAddress",…}}` on the brand's page. This module
 * turns structured values into the words a person reads and keeps JSON only as
 * the last resort for a shape nothing here can name, so nothing disappears.
 *
 * Pure: no React, no Supabase. The Overview and the list rows call it.
 */

const ADDRESS_KEYS = [
  "streetAddress",
  "addressLocality",
  "addressRegion",
  "postalCode",
  "addressCountry",
  "postOfficeBoxNumber",
] as const;

/** Keys that carry a fact's readable text, most specific first. */
const TEXT_KEYS = ["url", "text", "value", "telephone", "email", "name"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // schema.org nests a country as `{ "@type": "Country", "name": "US" }`.
  if (isRecord(value)) return textOf(value.name);
  return "";
}

function isPostalAddress(record: Record<string, unknown>): boolean {
  if (record["@type"] === "PostalAddress") return true;
  return ADDRESS_KEYS.some((key) => textOf(record[key]) !== "");
}

/** `street, city, region postal, country` — each part only when it is present. */
export function formatPostalAddress(record: Record<string, unknown>): string {
  const street = textOf(record.streetAddress);
  const locality = textOf(record.addressLocality);
  const regionAndPostal = [textOf(record.addressRegion), textOf(record.postalCode)]
    .filter(Boolean)
    .join(" ");
  const cityLine = [locality, regionAndPostal].filter(Boolean).join(", ");
  const country = textOf(record.addressCountry);
  const pobox = textOf(record.postOfficeBoxNumber);
  return [pobox, street, cityLine, country].filter(Boolean).join(", ");
}

/**
 * The readable form of any fact value. Strings and scalars read as themselves;
 * an address reads as one line; a record with a text-bearing key reads as that
 * text; anything else reads as `key: value` pairs; JSON only when nothing at all
 * could be named.
 */
export function businessFactValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => businessFactValueText(entry))
      .filter((text) => text !== "")
      .join("; ");
  }
  if (!isRecord(value)) return "";

  if (isPostalAddress(value)) return formatPostalAddress(value);
  if (isRecord(value.address)) return businessFactValueText(value.address);

  for (const key of TEXT_KEYS) {
    const text = textOf(value[key]);
    if (text) return text;
  }

  const pairs = Object.entries(value)
    .filter(([key]) => !key.startsWith("@"))
    .map(([key, entry]) => {
      const text = businessFactValueText(entry);
      return text ? `${key}: ${text}` : "";
    })
    .filter((pair) => pair !== "");
  if (pairs.length > 0) return pairs.join("; ");

  return JSON.stringify(value);
}


/** The five fields a person edits for an address fact. */
export interface PostalAddressFields {
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

/** The PostalAddress record a fact holds, whether wrapped or flat; null when none. */
function postalAddressOf(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isPostalAddress(value)) return value;
  if (isRecord(value.address) && isPostalAddress(value.address)) return value.address;
  return null;
}

/**
 * An address fact's five editable fields. Text that is not a PostalAddress
 * (a legacy plain string) lands in the street field, so editing never drops it.
 */
export function postalAddressFields(value: unknown): PostalAddressFields {
  const address = postalAddressOf(value);
  if (!address) {
    return { street: businessFactValueText(value), city: "", region: "", postalCode: "", country: "" };
  }
  return {
    street: textOf(address.streetAddress),
    city: textOf(address.addressLocality),
    region: textOf(address.addressRegion),
    postalCode: textOf(address.postalCode),
    country: textOf(address.addressCountry),
  };
}

/**
 * Writes edited address fields back into the fact's own jsonb shape. Keys the
 * editor does not show (postOfficeBoxNumber, an unknown @context) survive, the
 * wrapper `{ address: … }` survives, and a nested country `{ "@type": "Country",
 * name }` keeps its nesting. A field cleared to empty is removed, not blanked.
 */
export function applyPostalAddressFields(value: unknown, fields: PostalAddressFields): Json {
  const existing = postalAddressOf(value);
  const next: Record<string, Json> = existing
    ? (structuredClone(existing) as Record<string, Json>)
    : { "@type": "PostalAddress" };

  const writeField = (key: string, text: string) => {
    if (!text) {
      delete next[key];
      return;
    }
    const current = next[key];
    // A nested { "@type", name } keeps its nesting; only its name changes.
    if (isRecord(current) && "name" in current) {
      next[key] = { ...current, name: text };
      return;
    }
    next[key] = text;
  };
  writeField("streetAddress", fields.street.trim());
  writeField("addressLocality", fields.city.trim());
  writeField("addressRegion", fields.region.trim());
  writeField("postalCode", fields.postalCode.trim());
  writeField("addressCountry", fields.country.trim());

  if (existing && isRecord(value) && isRecord(value.address)) {
    return { ...(value as Record<string, Json>), address: next };
  }
  return next;
}

/**
 * Writes an edited single line back into a structured (non-address) value. The
 * line replaces the key that carries the readable text, and every other key
 * stays. Returns a plain string when the stored value is not a record.
 */
export function withFactText(value: unknown, text: string): string | Json {
  if (!isRecord(value)) return text;
  const key = TEXT_KEYS.find((candidate) => textOf(value[candidate]) !== "") ?? "text";
  return { ...(value as Record<string, Json>), [key]: text };
}
