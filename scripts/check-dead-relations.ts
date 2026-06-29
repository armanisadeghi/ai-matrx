#!/usr/bin/env tsx
/**
 * check-dead-relations — the fast, OFFLINE reference subset of the schema-truth
 * orchestrator (scripts/schema-check). Kept at this path/command because the
 * db-change skills and the pre-commit hook reference it.
 *
 * It runs the code-scanning checks that need no live refresh (they read the
 * committed snapshot scripts/schema-check/current-schema.json):
 *   • dead-relations          — refs to MOVED/RETIRED old names (the original guard)
 *   • dead-relations-registry — the registry's declared new homes vs live truth
 *   • direct-from-schema      — every `.from()/.schema()` vs the live snapshot
 *   • typed-refs              — `Database["S"]["Tables"]["X"]` vs live tables
 *   • qualified-refs          — raw `schema.table` strings vs live truth
 *
 * The FULL check (adds types-freshness + api-types-freshness + schema-exposure,
 * and can re-pull the live snapshot) is `pnpm check:schema` — run in release.sh / CI.
 *
 *   pnpm check:dead-relations           # loud, non-blocking (exit 0) — pre-commit
 *   pnpm check:dead-relations:strict    # exit 1 on any error — CI
 *
 * See scripts/schema-check/FEATURE.md.
 */
import { main } from "./schema-check/check-schema";

process.exit(
  main({
    only: [
      "dead-relations",
      "dead-relations-registry",
      "direct-from-schema",
      "typed-refs",
      "qualified-refs",
    ],
  }),
);
