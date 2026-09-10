# context-docs — matrx-frontend mechanics

The repo half of the `context-docs` skill (`.claude/skills/context-docs/SKILL.md`, synced from
common-docs — edit that one only in `common-docs/skills/context-docs/`). Read this before editing any
doc in matrx-frontend; it holds only what differs here.

## Where each kind of knowledge lives

- **`FEATURE.md` — beside its feature:** `features/<name>/FEATURE.md` (template
  `features/_FEATURE_TEMPLATE.md`). A feature `README.md` follows the same rules.

## Checks

- **`pnpm check:doc-claims`** whenever you change a claim `CLAUDE.md` makes, or a config setting it
  describes — the doc and the config change land in the same commit. A new load-bearing claim (a flag,
  a version, a route group, a script) → register it in `scripts/check-doc-claims.ts`, or it rots unseen.
  CI runs it `--strict`.
- **`pnpm check:docs-guards`** after creating or retitling any `.md`, or writing a common-docs pointer —
  it fails on a title claiming SOURCE OF TRUTH / CANONICAL / OFFICIAL, a new root-level `.md`, and a
  common-docs pointer in a stale layout or spelling.
- **No pointer-link script exists here** — after a move or rename, `grep -rn "<old path>"` across
  `CLAUDE.md`, `features/`, `docs/`, and `.claude/skills/`.

## `FOUND_DEFECTS.md`

- **Entry ID is `D<n>`**; `AD<n>` is aidream's ledger. Claiming an ID off the END of the file instead
  of the highest number produced four live collisions here (D193/D194/D195/D219).
