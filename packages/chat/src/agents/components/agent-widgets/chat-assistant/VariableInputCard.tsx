"use client";

/**
 * @deprecated The underlying
 * `variable-input-variations/AgentVariableInputCard` module was removed.
 * Use the variations in
 * `@/features/agents/components/inputs/variable-input-variations` directly
 * (e.g. `AgentVariableCards`).
 *
 * This shim is retained as a no-op so older imports still type-check. It
 * renders nothing and accepts arbitrary props.
 */

export type VariableInputCardProps = Record<string, unknown>;

export function VariableInputCard(_props: VariableInputCardProps): null {
  return null;
}
