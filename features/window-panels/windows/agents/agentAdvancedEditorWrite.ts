/**
 * Pure validators for the `matrx-user/agent-advanced-editor` write targets.
 *
 * Deliberately React-free and Redux-free. The writeback seam
 * (`features/surfaces/runtime/surface-writeback.ts`) turns a THROW into the
 * error envelope the agent reads back, and it can only do that if the throw
 * happens synchronously inside the handler call — not later, inside a React
 * updater. So every shape check lives here and the handler calls it before it
 * dispatches anything.
 *
 * Every message is written FOR A MODEL: it names the target, says what shape
 * was expected, and says what to send instead. Two of them spell out "plain
 * text, not JSON and not JSON-encoded" on purpose — the inline-tool layer
 * parses a JSON-looking argument before the handler ever sees it, so an agent
 * that gets a type error here will otherwise "fix" it by double-encoding the
 * value and sending escaped newlines into the user's system prompt.
 */

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { OutputSchema } from "@/features/agents/types/json-schema";
import { validateOutputSchema } from "@/features/agents/components/settings-management/output-schema/validateOutputSchema";
import {
  parseAgentCatalogProfile,
  type AgentCatalogProfilePatch,
} from "@/features/agents/surface-catalog-profile";

/** Canonical surface name — the ONE string chrome and handlers agree on. */
export const AGENT_ADVANCED_EDITOR_SURFACE_NAME =
  "matrx-user/agent-advanced-editor";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Name the type we actually received, so the agent can correct itself. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * A prose field: plain text, non-empty, trimmed.
 *
 * The "not JSON-encoded" clause is load-bearing — see the module docblock.
 */
export function requireProseText(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} expects PLAIN TEXT — not JSON and not JSON-encoded text. ` +
        `Received ${describe(value)}. Send the prose itself as the value, ` +
        `with real newlines, no surrounding quotes and no escape sequences.`,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      `${target} expects a non-empty string. Send the text you want in the ` +
        `field; there is no target for clearing it — that stays a user edit.`,
    );
  }
  return trimmed;
}

/**
 * The composite catalog-profile value: `{description?, category?, tags?}`.
 *
 * DEFINED ELSEWHERE ON PURPOSE. `matrx-user/agent-settings` writes the same
 * three columns on the same agent from the Agent Settings window, so the
 * contract — accepted keys, per-field bounds, replace-vs-patch semantics, and
 * the prose the model reads — lives once in
 * `features/agents/surface-catalog-profile.ts` and both surfaces import it.
 * Two definitions over the same fields is the defect that file exists to
 * prevent; see its docblock for why the two still keep separate target NAMES
 * (a shared name would be captured deepest-first by whichever of the two
 * windows happened to be on top, staging text into an agent the user who
 * pressed Apply cannot see).
 *
 * This wrapper only binds the target name into the error messages, so this
 * window's call site and its throw text are unchanged.
 */
export function parseCatalogProfile(value: unknown): AgentCatalogProfilePatch {
  return parseAgentCatalogProfile(value, "editor_catalog_profile");
}

/**
 * The structured-output schema envelope.
 *
 * Accepts the OBJECT, never a string of JSON — the inline-tool layer already
 * parsed anything that looked like JSON, so a string arriving here means the
 * agent double-encoded it, and the message says exactly that.
 *
 * Hard errors from the product's own advisory validator
 * (`validateOutputSchema` — the same one the Output Schema tab's Validate
 * button runs) become the throw text, so the agent hears the real reason
 * ("Missing \"name\"", "Root \"schema.type\" must be \"object\"") rather than
 * a generic rejection. Warnings and suggestions are deliberately NOT fatal:
 * they are the same advisory notes a human is free to ignore in the tab.
 *
 * Clearing the schema is not offered. Removing structured output changes what
 * every downstream consumer of this agent receives, and the tab already has a
 * one-click human path for it.
 */
export function parseOutputSchemaWrite(
  value: unknown,
): NonNullable<AgentDefinition["outputSchema"]> {
  if (typeof value === "string") {
    throw new Error(
      `editor_output_schema expects a JSON OBJECT, not a string. The value you sent ` +
        `arrived as text, which means it was JSON-encoded twice. Send the ` +
        `schema as structured JSON: {"name": "...", "strict": true, ` +
        `"schema": {"type": "object", ...}}.`,
    );
  }
  if (!isPlainObject(value)) {
    throw new Error(
      `editor_output_schema expects an object shaped like ` +
        `{"name": "...", "schema": {...}, "strict": true} — received ` +
        `${describe(value)}.`,
    );
  }
  if (Object.keys(value).length === 0) {
    throw new Error(
      `editor_output_schema cannot be cleared from here — an empty object would ` +
        `turn structured output off for this agent. Send a complete schema, ` +
        `or leave the field to the user.`,
    );
  }

  const report = validateOutputSchema(value);
  if (!report.ok) {
    throw new Error(
      `editor_output_schema is not a usable structured-output schema: ` +
        `${report.errors.join(" ")} Read the current \`agent_output_schema\` ` +
        `value for the shape this agent already uses.`,
    );
  }

  // Validated against the real envelope rules above (name / schema / root
  // type), which is exactly what OutputSchema declares. The tab's own Apply
  // path performs the same re-wrap from the edited JSON dict.
  // MATRX-EXCEPTION: validateOutputSchema is a runtime validator, not a type guard.
  return value as unknown as OutputSchema;
}
