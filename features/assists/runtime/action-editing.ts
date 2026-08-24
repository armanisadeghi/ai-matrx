/**
 * Editable Assist actions — the typed seam between a suggestion and a
 * user-customized approval.
 *
 * The ledger action remains the suggestion's durable identity. An editor
 * returns a new in-memory action for the runner, so accepting a customized
 * suggestion still uses the action's canonical handler and write path.
 *
 * This first primitive deliberately supports one text field. Add a second
 * shape only when a real action needs it; do not grow a speculative form
 * schema here.
 */

import type { AssistAction } from "../types";

const KEYWORD_GUIDELINES_MAX_LENGTH = 40_000;

export interface AssistActionTextEditorDefinition {
  /** Short call to action shown before the editor opens. */
  triggerLabel: string;
  /** Plain name of the item being edited. */
  label: string;
  /** Only present when the field needs genuinely useful clarification. */
  description?: string;
  value: string;
  maxLength?: number;
  validate: (value: string) => string | null;
  /** Rebuild the complete typed action while preserving its identity fields. */
  apply: (value: string) => AssistAction;
}

/**
 * Returns the user-editable text contract for an action, when it has one.
 * Non-editable actions return null and keep the ordinary one-click flow.
 */
export function getAssistActionTextEditor(
  action: AssistAction,
): AssistActionTextEditorDefinition | null {
  if (
    action.kind !== "apply_keyword_meaning" ||
    action.proposal.proposal !== "guideline_edit"
  ) {
    return null;
  }

  return {
    triggerLabel: "Edit guidelines",
    label: "Keyword guidelines",
    value: action.proposal.proposedText,
    maxLength: KEYWORD_GUIDELINES_MAX_LENGTH,
    validate: (value) => {
      if (!value.trim()) return "Guidelines cannot be empty.";
      if (value.length > KEYWORD_GUIDELINES_MAX_LENGTH) {
        return `Keep the guidelines under ${KEYWORD_GUIDELINES_MAX_LENGTH.toLocaleString()} characters.`;
      }
      return null;
    },
    apply: (value) => ({
      ...action,
      proposal: {
        ...action.proposal,
        proposedText: value,
      },
    }),
  };
}
