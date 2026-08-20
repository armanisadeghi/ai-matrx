/**
 * Client-side parse of what the user pastes, drops, or scans.
 *
 * The SERVER is the authority — `aidream/services/authenticator/otpauth.py`
 * parses the same string again before anything is stored. This exists so the
 * enrollment surface can do what every good authenticator does: tell the person
 * *immediately* whether what they just handed us is usable, and show them
 * WHICH account it is for before they commit.
 *
 * 🚨 Keep the rules here in lockstep with `otpauth.py` / `otp.py`
 * (SUPPORTED_DIGITS, SUPPORTED_ALGORITHMS, base32 cleaning). A preview that
 * accepts what the server refuses is worse than no preview.
 *
 * The parsed `secret` never leaves this browser except as the enrollment
 * request body, and is never logged, stored, or rendered.
 */

export const TOTP_DEFAULT_DIGITS = 6;
export const TOTP_DEFAULT_PERIOD = 30;
export const TOTP_DEFAULT_ALGORITHM = "SHA1";

const SUPPORTED_DIGITS = new Set([6, 7, 8]);
const SUPPORTED_ALGORITHMS = new Set(["SHA1", "SHA256", "SHA512"]);
const BASE32_RE = /^[A-Z2-7]+$/;

/** What one enrollment input resolves to. Metadata + the seed the user brought. */
export interface ParsedEnrollment {
  /** The exact string to send to `/enroll` — the original input, untouched. */
  raw: string;
  digits: number;
  period: number;
  algorithm: string;
  /** Service name from the URI (`issuer=` or the `Issuer:` label prefix). */
  issuer: string | null;
  /** Account the code belongs to — usually an email or username. */
  account: string | null;
  /** True when the input carried issuer/account/params, false for a bare key. */
  fromUri: boolean;
}

export class InvalidEnrollmentInputError extends Error {}

/** Base32 setup keys are printed in groups with spaces or dashes; sites also
 *  vary the case. Same cleaning the server does before decoding. */
function assertUsableSecret(secret: string): void {
  const cleaned = secret.trim().replace(/[\s-]/g, "").toUpperCase();
  if (!cleaned) throw new InvalidEnrollmentInputError("No setup key in that.");
  if (!BASE32_RE.test(cleaned)) {
    throw new InvalidEnrollmentInputError(
      "That setup key has characters a code secret cannot contain. Copy it again from the website.",
    );
  }
  // base32 encodes 5 bits per character; anything under 8 chars is not a seed.
  if (cleaned.length < 8) {
    throw new InvalidEnrollmentInputError("That setup key is too short to be real.");
  }
}

function normalizeAlgorithm(value: string | null): string {
  const algo = (value || TOTP_DEFAULT_ALGORITHM).trim().toUpperCase();
  if (!SUPPORTED_ALGORITHMS.has(algo)) {
    throw new InvalidEnrollmentInputError(
      `This site asks for ${algo} codes, which we do not support yet.`,
    );
  }
  return algo;
}

function splitLabel(label: string | null): { issuer: string | null; account: string | null } {
  if (!label) return { issuer: null, account: null };
  const idx = label.indexOf(":");
  if (idx === -1) return { issuer: null, account: label || null };
  return {
    issuer: label.slice(0, idx).trim() || null,
    account: label.slice(idx + 1).trim() || null,
  };
}

/**
 * Parse a bare base32 setup key or a full `otpauth://totp/…` URI.
 *
 * Throws {@link InvalidEnrollmentInputError} with copy a non-technical person
 * can act on — never a raw parser message.
 */
export function parseEnrollmentInput(input: string): ParsedEnrollment {
  const text = (input ?? "").trim();
  if (!text) throw new InvalidEnrollmentInputError("Nothing to read yet.");

  if (!text.toLowerCase().startsWith("otpauth://")) {
    if (/^otpauth-migration:/i.test(text)) {
      throw new InvalidEnrollmentInputError(
        "That is a Google Authenticator export code, which holds several accounts at once. Open the site's two-factor page and use its own QR code or setup key instead.",
      );
    }
    if (/^https?:\/\//i.test(text)) {
      throw new InvalidEnrollmentInputError(
        "That QR code is a web link, not a two-factor setup code.",
      );
    }
    assertUsableSecret(text);
    return {
      raw: text,
      digits: TOTP_DEFAULT_DIGITS,
      period: TOTP_DEFAULT_PERIOD,
      algorithm: TOTP_DEFAULT_ALGORITHM,
      issuer: null,
      account: null,
      fromUri: false,
    };
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new InvalidEnrollmentInputError("That setup link is malformed.");
  }
  if (url.host.toLowerCase() !== "totp") {
    throw new InvalidEnrollmentInputError(
      "That is a counter-based (HOTP) code. We support the time-based codes that change every 30 seconds.",
    );
  }

  const secret = url.searchParams.get("secret");
  if (!secret) {
    throw new InvalidEnrollmentInputError("That setup link carries no secret.");
  }
  assertUsableSecret(secret);

  const digits = Number(url.searchParams.get("digits") ?? TOTP_DEFAULT_DIGITS);
  if (!SUPPORTED_DIGITS.has(digits)) {
    throw new InvalidEnrollmentInputError(
      `This site asks for ${digits}-digit codes, which we do not support yet.`,
    );
  }
  const period = Number(url.searchParams.get("period") ?? TOTP_DEFAULT_PERIOD);
  if (!Number.isInteger(period) || period <= 0) {
    throw new InvalidEnrollmentInputError("That setup link has an invalid refresh interval.");
  }
  const algorithm = normalizeAlgorithm(url.searchParams.get("algorithm"));

  const label = decodeURIComponent(url.pathname.replace(/^\//, "")) || null;
  const fromLabel = splitLabel(label);
  const issuer = url.searchParams.get("issuer")?.trim() || fromLabel.issuer;

  return {
    raw: text,
    digits,
    period,
    algorithm,
    issuer: issuer || null,
    account: fromLabel.account,
    fromUri: true,
  };
}

/** The one-line human name for a parsed enrollment ("GitHub · me@x.com"). */
export function describeEnrollment(parsed: ParsedEnrollment): string {
  const parts = [parsed.issuer, parsed.account].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "Setup key";
}
