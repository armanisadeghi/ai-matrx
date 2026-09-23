/** PostgREST returns a complete RPC answer below its 1,000-row response cap. */
const REACHABILITY_RESPONSE_CAP = 1_000;

export function reachabilityCoverage(noun: string, loaded: number) {
  return {
    loaded,
    ...(loaded < REACHABILITY_RESPONSE_CAP
      ? { total: loaded }
      : { cap: REACHABILITY_RESPONSE_CAP }),
    answeredBy: "client" as const,
    noun,
  };
}
