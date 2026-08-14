/**
 * Canonical contact-value normalization — the ONE implementation.
 *
 * Split out of `service.ts` (which it is re-exported from, so every existing
 * importer is unchanged) purely so it can be imported by code that must not
 * pull in the Supabase client: the selection parser, and its tests.
 *
 * Server twin: aidream `services/crm/canonicalize.py`. The two must stay
 * byte-identical in semantics — drift here is a duplicate factory.
 */

import type { ContactChannel } from "./types";

/**
 * Normalize a raw value into the medium's `value_key`. The DB enforces:
 * email → lowercase; phone → E.164 (`^\+[1-9][0-9]{6,14}$`). Throws a
 * human-readable error when the value cannot be normalized — surfacing it
 * beats letting the CHECK constraint produce a cryptic 23514.
 */
export function normalizeMediumValue(
  channel: ContactChannel,
  raw: string,
): { valueKey: string; valueRaw: string; displayValue: string } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Value is required");

  if (channel === "email") {
    const key = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      throw new Error(`"${trimmed}" is not a valid email address`);
    }
    return { valueKey: key, valueRaw: trimmed, displayValue: key };
  }

  if (channel === "phone") {
    const digits = trimmed.replace(/[^\d+]/g, "");
    let key: string;
    if (digits.startsWith("+")) {
      key = `+${digits.slice(1).replace(/\D/g, "")}`;
    } else {
      const bare = digits.replace(/\D/g, "");
      // Bare 10-digit numbers are assumed US/CA; 11 digits starting with 1 too.
      if (bare.length === 10) key = `+1${bare}`;
      else if (bare.length === 11 && bare.startsWith("1")) key = `+${bare}`;
      else key = `+${bare}`;
    }
    if (!/^\+[1-9][0-9]{6,14}$/.test(key)) {
      throw new Error(
        `"${trimmed}" is not a valid phone number — use international format, e.g. +13105551234`,
      );
    }
    return { valueKey: key, valueRaw: trimmed, displayValue: key };
  }

  // social / messaging / url / external_id: case-insensitive identity key.
  return {
    valueKey: trimmed.toLowerCase(),
    valueRaw: trimmed,
    displayValue: trimmed,
  };
}
