/**
 * Contract comparison moved to the canonical agent-slots primitive —
 * `@/features/agents/slots/contract-compare` (`compareContracts`,
 * `systemContractRows`, `ComparisonResult`, `ContractRow`). Import from
 * there; this file keeps only research-local display helpers.
 */

/**
 * Truncates a UUID for compact display: `2e081af2…6325c6c80f`.
 */
export function shortUuid(id: string): string {
  if (id.length < 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-12)}`;
}
