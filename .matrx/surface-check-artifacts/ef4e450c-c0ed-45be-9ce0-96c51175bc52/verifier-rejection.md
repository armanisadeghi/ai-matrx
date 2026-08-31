# Independent verifier rejection

Verdict: **REJECT — ledger not promoted.**

The fresh verifier passed S1, S2, S4, S7, S8, S10, and S12–S16; S5 and S17 were not applicable. It rejected S3, S6, S9, S11, and S18 for these exact reasons:

1. `candidate.json` recorded a mistyped, nonexistent full SHA. The historical candidate remains unchanged so the rejection is auditable.
2. The candidate did not include forcing accepted/refused evidence for all seven root Settings write targets.
3. The Error Inspector reproduced the current browser cancellation wording, `AbortError: signal is aborted without reason`, from `listGoogleConnectionInventory` during navigation/unmount.
4. The live mobile artifact exercised the drawer through the `contextmenu` compatibility path, not a genuine touch hold.

Repairs pushed after rejection:

- `21f284b4eb` recognizes the current browser abort wording in the canonical Supabase cancellation classifier and pins it with an exact adapter regression.
- `4fb3627c81` pins the genuine 480 ms `touchstart` hold path and adds table-driven accepted/refused contract coverage for every declared Settings write target.
- Focused post-repair result: 5 suites / 33 tests passed, target ESLint passed, and `pnpm type-check` passed.

Remaining certification work: re-run the live target and dispatch a new fresh independent verifier. At the time this record was written, the only managed preview lane was correctly left untouched because it was owned by `/private/tmp/matrx-qa-q2-repair.GbVFwZ` (PID 87179).
