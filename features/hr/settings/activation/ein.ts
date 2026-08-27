// features/hr/settings/activation/ein.ts
//
// The EIN's format rule, in ONE place, because two surfaces validate it (the
// activation wizard's step 1 and route 68's identity section) and two copies of a
// format rule drift.
//
// SPEC-EMPLOYEES §2.4 route 68: **EIN format `NN-NNNNNNN`**. That is the IRS's own
// presentation form — two digits, a hyphen, seven digits. We do NOT validate the
// prefix against the IRS campus list: that list changes, a valid-but-unlisted prefix
// would be rejected as malformed, and refusing a real employer's real number is a
// worse failure than accepting a well-formed wrong one.

const EIN_PATTERN = /^\d{2}-\d{7}$/;

export type EinCheck =
  | { ok: true; value: string }
  | { ok: false; why: string };

/**
 * Normalize and check an EIN.
 *
 * Digits typed without the hyphen are FORMATTED, not rejected — a person reading a
 * number off a letter should not have to know where the hyphen goes. Anything else
 * is refused with the reason in words, at the field, before the wizard commits.
 */
export function checkEin(raw: string): EinCheck {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {
      ok: false,
      why: "An EIN is required — it is what identifies this employer to the IRS, and payroll, W-2s and new-hire reports all carry it.",
    };
  }

  const digits = trimmed.replace(/[^0-9]/g, "");
  const candidate = digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : trimmed;

  if (!EIN_PATTERN.test(candidate)) {
    return {
      ok: false,
      why: "An EIN is nine digits, written NN-NNNNNNN — for example 12-3456789.",
    };
  }
  return { ok: true, value: candidate };
}

/** Format as the user types, without fighting them: digits in, hyphen placed at two. */
export function formatEinInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** Last four, for the places that may show a partial. Never derived from a full value we do not hold. */
export function einLastFour(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
