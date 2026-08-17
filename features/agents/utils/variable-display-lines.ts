// features/agents/utils/variable-display-lines.ts
//
// THE ONE RULE for showing a conversation's launch variables to a human.
//
// A surface routinely WIRES variables on the user's behalf — the Masterwork
// Scout panel sends `rulebook_id`, a shortcut sends the note it was fired from,
// the code editor sends the open file. The user never typed those values and
// can do nothing with them, so printing them raw read literally
// "Rulebook id: 56d96d67-c266-4d0f-b826-f6f4fff4ed66" to a non-technical Expert
// mid-interview — the exact developer leakage this product must never show
// (CLAUDE.md § The user).
//
// Hiding the INPUT panel (`variablesPanelStyle: "hidden"`) does NOT fix this:
// that only suppresses the collection UI, while the message display renders the
// same values again. So the rule lives HERE, once, and every display path
// consumes it — there is no per-surface prop to remember and no second place to
// forget.
//
// The rule, in order:
//   1. System-reserved keys (`__agent_user_input__`) are not launch values —
//      they mirror the message body. Dropped.
//   2. Empty values are dropped.
//   3. A bare UUID whose KEY names a known entity (`rulebook_id` → `rulebook`)
//      becomes an ENTITY line — rendered as a real door with the record's human
//      name (THE DOOR LAW: never render an id you can't open).
//   4. A bare UUID that resolves to nothing is DROPPED. An id the user can
//      neither read nor open is noise, not information — and it is banned by
//      both rules at once.
//   5. Everything else renders as text.

import {
  formatVariableDisplayName,
  variableValueToDisplay,
} from "@/features/agents/utils/variable-utils";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { getCachedEntityTitle } from "@/features/scopes/service/entityTitles";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VariableDisplayLine {
  /** The raw variable name — a stable React key. */
  key: string;
  /** Human label for the variable itself ("Rulebook"). */
  label: string;
  /**
   * Set when the value is a machine-wired record id that resolves to a known
   * entity. Render it as an `EntityRef` (a door), never as text.
   */
  entity: { token: string; id: string } | null;
  /** Human text for a non-entity value. Empty string when `entity` is set. */
  text: string;
}

/**
 * A wired id becomes an entity reference when its KEY names a registered
 * entity type. `rulebook_id` → `rulebook`; `page_id` → `page`; a key whose base
 * is not a known token (or a value that isn't a UUID) resolves to null.
 */
function resolveEntityVariable(
  key: string,
  value: unknown,
): { token: string; id: string } | null {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) return null;
  const base = key.replace(/_?id$/i, "").replace(/_+$/, "");
  if (!base) return null;
  const token = resolveEntityToken(base);
  return tryGetEntityInfo(token) ? { token, id: value.trim() } : null;
}

/**
 * Turn a conversation's launch variables into the lines a human should see.
 * Consumed by every display path — the first-turn strip on the user bubble and
 * the text-only recovery surfaces.
 */
export function buildVariableDisplayLines(
  values: Record<string, unknown>,
): VariableDisplayLine[] {
  const lines: VariableDisplayLine[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (/^__.*__$/.test(key)) continue;
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    const entity = resolveEntityVariable(key, value);
    if (entity) {
      lines.push({
        key,
        label: formatVariableDisplayName(key.replace(/_?id$/i, "")) || key,
        entity,
        text: "",
      });
      continue;
    }

    // A bare id we cannot turn into a door is dropped, never printed.
    if (typeof value === "string" && UUID_RE.test(value.trim())) continue;

    const text = variableValueToDisplay(value);
    if (!text.trim()) continue;
    lines.push({
      key,
      label: formatVariableDisplayName(key),
      entity: null,
      text,
    });
  }

  return lines;
}

/**
 * The TEXT-ONLY rendering of the same lines, for surfaces that cannot render a
 * door (plain-text panes, paste-back text).
 *
 * An entity line prints the record's name when the title cache already holds it
 * (populated by any surface that resolved it through `useEntityTitles`) and is
 * otherwise OMITTED — a text surface has nowhere to put a door, so printing the
 * id would reintroduce exactly the leak this module exists to close.
 */
export function formatVariableDisplayLines(
  values: Record<string, unknown>,
): string {
  return buildVariableDisplayLines(values)
    .map((line) => {
      if (!line.entity) return `${line.label}: ${line.text}`;
      const title = getCachedEntityTitle(line.entity.token, line.entity.id);
      return title ? `${line.label}: ${title}` : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}
