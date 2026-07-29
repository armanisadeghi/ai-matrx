import { VALID_KEY_RE } from "@/features/secrets/types";

export interface EnvAssignment {
  key: string;
  value: string;
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
