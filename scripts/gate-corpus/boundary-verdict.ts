/**
 * `restore-graph.ts --verify`'s per-table verdict, in its own module so it can be
 * tested without running the copy. See the function's own comment for why it is a
 * floor and not an equality (ATTACK-6 finding 7).
 */
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

/**
 * ONE TABLE'S VERDICT AGAINST THE RECORDED BOUNDARY — A FLOOR, NOT AN EQUALITY.
 *
 * 🚨 ATTACK-6 finding 7. This used to be `if (n !== want) fail(...)`. The boundary is
 * frozen at the copy, so the FIRST lane to write a row into any of the 25 copied tables
 * turned `--verify` red permanently — and `restore-graph.ts` is the only named producer
 * of rule 34's PROOF 4, which eleven exit clauses cite. `W1-ORG`'s exit is "a fresh
 * signup executed end to end with the resulting organization row count read", which
 * writes `iam.organizations`, `iam.memberships` and `auth.users`; it ends at H+19.75,
 * before the first cell that cites rule 34 at H+22.50. `W2-ACCESS` then writes
 * `iam.permissions`. So from H+19.75 every lane and verifier bound by rule 34 would have
 * run a command that returns FAILED — with five green floor lines inside it, for a reason
 * that is not the floor, on the critical path, at 3 a.m.
 *
 * What the boundary can honestly assert is that the branch still holds AT LEAST what the
 * copy put there. Rows the campaign's own lanes add afterwards are the campaign working,
 * not the graph being wrong. Rows DISAPPEARING is still a failure, and is still named.
 * Growth is printed, with its size, so a surprise is visible rather than silent.
 */
export function boundaryVerdict(
  table: string,
  n: number,
  restored: number | undefined,
  extras: number | undefined,
): { ok: boolean; message: string } {
  const floor = Number(restored ?? NaN) + Number(extras ?? 0);
  if (!Number.isFinite(floor))
    return { ok: false, message: `${table}: the recorded boundary holds no count for it` };
  if (n < floor)
    return {
      ok: false,
      message:
        `${table}: branch holds ${n}, BELOW the recorded boundary's ${restored} restored + ` +
        `${extras ?? 0} branch-only = ${floor}. Rows the copy put there are GONE.`,
    };
  const grew = n - floor;
  return {
    ok: true,
    message:
      `${table.padEnd(30)} ${n} ≥ the boundary's ${restored}` +
      (extras ? ` + ${extras} branch-only` : "") +
      (grew ? ` ${DIM}(+${grew} written since the copy — lanes write here)${RESET}` : ""),
  };
}
