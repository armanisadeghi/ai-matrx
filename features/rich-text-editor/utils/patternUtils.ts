export const MATRX_PATTERN = /<<<MATRX_START>>>(.*?)<<<MATRX_END>>>/gs;

export type MatrxMetadata = Record<string, string>;

/** Parses the inner payload of a MATRX widget block. */
export function parseMatrxMetadata(content: string): MatrxMetadata {
  const trimmed = content.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: MatrxMetadata = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") out[key] = value;
        else if (value != null) out[key] = String(value);
      }
      return out;
    }
  } catch {
    // fall through to key=value parsing
  }

  const out: MatrxMetadata = {};
  for (const segment of trimmed.split(/[,;\n]/)) {
    const idx = segment.indexOf("=");
    if (idx === -1) continue;
    const key = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  if (!out.id && !out.name && trimmed) out.name = trimmed.slice(0, 80);
  return out;
}
