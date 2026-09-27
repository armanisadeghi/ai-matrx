// STUB — replaced by the real implementation once the test has been seen red.
export const WALK_CAP_FEATURE = "ops.agent_walks";
export const WALK_CAP_HEADER = "x-matrx-walk-cap";
export interface WalkKnobs { cap: number; windowMinutes: number }
export interface ActiveWalk { host: string; idleMs: number }
export type WalkDecision =
  | { verdict: "admit"; newlyAdmitted: boolean; active: ActiveWalk[] }
  | { verdict: "refuse"; active: ActiveWalk[] };
export function decideWalkAdmission(
  _registry: Map<string, number>, _host: string, _now: number, _knobs: WalkKnobs,
): WalkDecision {
  return { verdict: "admit", newlyAdmitted: true, active: [] };
}
export function createWalkKnobReader(_deps: unknown): () => Promise<WalkKnobs | null> {
  return async () => ({ cap: 4, windowMinutes: 10 });
}
export async function walkCapGate(..._args: unknown[]): Promise<Response | null> {
  return null;
}
