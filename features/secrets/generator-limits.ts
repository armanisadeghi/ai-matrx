import { fetchKnobIndex } from "@/lib/scoped-config/service";

export type VaultGeneratorLimits = {
  maxPasswordLength: number;
  maxPassphraseWords: number;
};

const KEYS = ["max_password_length", "max_passphrase_words"] as const;
const TECHNICAL_MAXIMA = {
  maxPasswordLength: 65_536,
  maxPassphraseWords: 4_096,
} as const;

/** The generator remains unavailable until both organization-scoped limits are live. */
export async function fetchVaultGeneratorLimits(
  organizationId: string,
  userId: string,
): Promise<VaultGeneratorLimits> {
  const knobs = await fetchKnobIndex({
    organizationId,
    userId,
    featurePrefix: "vault.generator",
  });
  const values = Object.fromEntries(
    knobs.map((knob) => [knob.key, knob.effective_value]),
  );
  const [maxPasswordLength, maxPassphraseWords] = KEYS.map((key) =>
    Number(values[key]),
  );
  if (
    !Number.isSafeInteger(maxPasswordLength) ||
    !Number.isSafeInteger(maxPassphraseWords) ||
    maxPasswordLength <= 0 ||
    maxPassphraseWords < 6 ||
    maxPasswordLength > TECHNICAL_MAXIMA.maxPasswordLength ||
    maxPassphraseWords > TECHNICAL_MAXIMA.maxPassphraseWords
  ) {
    throw new Error(
      "Password generation is not configured for this organization yet.",
    );
  }
  return { maxPasswordLength, maxPassphraseWords };
}
