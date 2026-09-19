/**
 * THE VARIABLE EDITOR'S ADDRESS (R35 — every window with a durable subject has one).
 *
 * The editor's subject is a PAIR: which agent, and which of its variables. One
 * without the other opens a frame with nothing in it, so the two are minted and
 * parsed here together and never drift apart — the same shape the topical-map
 * topic panel uses for its (map, topic) pair.
 *
 * Wire form: `?panels=agent_variable:<agentId>|<variableName>`.
 *
 * `|` is the separator because the `?panels=` arg encoding splits args on `-`
 * and a variable name may contain one; a UUID never contains `|`, and neither
 * does any name the variable editor accepts.
 */

export interface VariableEditorAddress {
  agentId: string;
  variableName: string;
}

const SEPARATOR = "|";

export function variableEditorInstanceId({
  agentId,
  variableName,
}: VariableEditorAddress): string {
  return `${agentId}${SEPARATOR}${variableName}`;
}

/** Null for half an identity — the caller says so rather than opening an empty frame. */
export function parseVariableEditorInstanceId(
  instanceId: string | null | undefined,
): VariableEditorAddress | null {
  if (!instanceId) return null;
  const at = instanceId.indexOf(SEPARATOR);
  if (at <= 0) return null;
  const agentId = instanceId.slice(0, at);
  const variableName = instanceId.slice(at + SEPARATOR.length);
  if (!agentId || !variableName) return null;
  return { agentId, variableName };
}
