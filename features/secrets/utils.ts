import { VALID_KEY_RE } from "@/features/secrets/types";

export interface EnvAssignment {
  key: string;
  value: string;
}

const PASSWORD_LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const PASSWORD_UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_SYMBOLS = "!@#$%^&*-_=+?";
const PASSWORD_GROUPS = [
  PASSWORD_LOWERCASE,
  PASSWORD_UPPERCASE,
  PASSWORD_DIGITS,
  PASSWORD_SYMBOLS,
] as const;
const PASSWORD_ALPHABET = PASSWORD_GROUPS.join("");

function secureRandomIndex(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive safe integer");
  }
  const range = 0x1_0000_0000;
  const unbiasedLimit = Math.floor(range / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(sample);
  } while (sample[0] >= unbiasedLimit);
  return sample[0] % maxExclusive;
}

/** Browser-local password for a credential the current user will own.
 *
 * Values typed into the create form already exist transiently in this browser;
 * generation does not widen that boundary. The alphabet excludes characters
 * people commonly confuse and guarantees lowercase, uppercase, digit, and
 * symbol coverage before a cryptographically secure shuffle.
 */
export function generateVaultPassword(length = 24): string {
  if (!Number.isSafeInteger(length) || length < PASSWORD_GROUPS.length) {
    throw new RangeError(
      `password length must be at least ${PASSWORD_GROUPS.length}`,
    );
  }

  const characters = PASSWORD_GROUPS.map(
    (group) => group[secureRandomIndex(group.length)],
  );
  while (characters.length < length) {
    characters.push(
      PASSWORD_ALPHABET[secureRandomIndex(PASSWORD_ALPHABET.length)],
    );
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters.join("");
}

/** Parse one pasted dotenv assignment without expanding or interpreting its value. */
export function parseEnvAssignment(input: string): EnvAssignment | null {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length !== 1 || lines[0].startsWith("#")) return null;

  const line = lines[0].startsWith("export ")
    ? lines[0].slice("export ".length).trimStart()
    : lines[0];
  const separatorIndex = line.indexOf("=");

  if (separatorIndex < 0) return null;

  const key = line.slice(0, separatorIndex).trim();
  let value = line.slice(separatorIndex + 1).trim();

  if (!VALID_KEY_RE.test(key)) return null;

  const hasMatchingQuotes =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")));

  if (hasMatchingQuotes) value = value.slice(1, -1);

  return { key, value };
}
