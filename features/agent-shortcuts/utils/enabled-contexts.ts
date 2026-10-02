import {
  isValidShortcutContext,
  type ShortcutContext,
} from "@ai-matrx/chat/agents/utils/shortcut-context-utils";

/**
 * Parse comma/semicolon/newline-separated input into known shortcut context keys.
 * Unknown tokens are dropped (keeps forms and API payloads type-safe).
 */
export function parseShortcutContextsInput(raw: string): ShortcutContext[] {
  const seen = new Set<ShortcutContext>();
  for (const part of raw.split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t || !isValidShortcutContext(t)) continue;
    seen.add(t);
  }
  return Array.from(seen);
}

/**
 * Display ShortcutContext[] as a single comma-separated field for form inputs.
 */
export function formatShortcutContextsForInput(
  values: ShortcutContext[] | null | undefined,
): string {
  if (!values?.length) return "";
  return values.join(", ");
}
