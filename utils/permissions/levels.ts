/**
 * The ONE permission-level ladder.
 *
 * Every rank map, label map, ordered array and level union in the app derives
 * from `PERMISSION_LEVELS` below. Before this module existed the ladder was
 * hard-coded in eight places as `viewer | editor | admin`, so a fourth level
 * would have been missing from most of them — and missing SILENTLY: a rank
 * lookup returned `undefined`, `undefined >= 2` is `false`, and the holder of
 * the new level was refused with no message anywhere (law 4, nothing fails
 * silently). `getPermissionLevelLabel` was worse: it returned `undefined` and
 * the screen rendered a blank string where the level should be.
 *
 * ## Code ladder vs database enum — deliberately different widths
 *
 * `PERMISSION_LEVELS` (the CODE ladder) is the superset and includes
 * `commenter`. `DB_PERMISSION_LEVELS` (the DATABASE enum, read at runtime from
 * the generated `Constants`, never hand-typed) is what `public.permission_level`
 * actually holds today: `viewer, editor, admin`. `commenter` is NOT there yet.
 *
 * That gap is the whole point and it is safe in one direction only:
 *
 * - READING / COMPARING / LABELLING a level: always use the code ladder. It
 *   tolerates `commenter` the moment the database gains it, with no code change
 *   and no silent refusal in between. Nothing breaks while the value never
 *   arrives — the extra rank and label simply go unused.
 * - WRITING a level to the database, or OFFERING it in a picker: narrow through
 *   `toDbPermissionLevel` / `DB_PERMISSION_LEVELS` first. Sending `commenter`
 *   to Postgres today fails with `invalid input value for enum
 *   public.permission_level`, so the ladder refuses it HERE, by name, with the
 *   remedy — rather than letting a picker offer a value the save will reject.
 *
 * When `ALTER TYPE public.permission_level ADD VALUE 'commenter' BEFORE 'editor'`
 * is applied and `pnpm db-types` regenerated, `DB_PERMISSION_LEVELS` widens on
 * its own and every picker driven by it gains the option with no further edit.
 *
 * Doctrine: the access levels are `viewer` · `commenter` · `editor` · `admin`
 * (AI Matrx Data Doctrine R18, 2026-09-10;
 * common-docs/systems/platform/access/DECISIONS.md).
 * Guard: `utils/permissions/__tests__/permission-levels.test.ts` fails if any
 * rank map, label map or ordered array omits a level.
 */

import { Constants } from "@/types/database.types";
import type { Database } from "@/types/database.types";

/**
 * The canonical ladder, ascending. THE ONE PLACE a level is declared.
 * Order is authority order: each entry outranks every entry before it.
 */
export const PERMISSION_LEVELS = [
  "viewer",
  "commenter",
  "editor",
  "admin",
] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** Ordinal rank, 1-based, derived from the ladder so it can never drift. */
export const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> =
  Object.fromEntries(
    PERMISSION_LEVELS.map((level, index) => [level, index + 1]),
  ) as Record<PermissionLevel, number>;

/** Sentence labels, used where the level is described ("Can view"). */
export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  viewer: "Can view",
  commenter: "Can comment",
  editor: "Can edit",
  admin: "Full access",
};

/** Noun labels, used in pickers and chips ("Viewer"). */
export const PERMISSION_LEVEL_SHORT_LABELS: Record<PermissionLevel, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  editor: "Editor",
  admin: "Full access",
};

/**
 * The narrower type the generated database types expose. `PermissionLevel` is a
 * superset of this — widening, never a cast that throws the difference away.
 */
export type DbPermissionLevel = Database["public"]["Enums"]["permission_level"];

/**
 * The values `public.permission_level` holds RIGHT NOW, read from the generated
 * constants rather than re-typed here, so it widens by regeneration alone.
 */
export const DB_PERMISSION_LEVELS: readonly DbPermissionLevel[] =
  Constants.public.Enums.permission_level;

/** Type guard for an arbitrary value being a known code-ladder level. */
export function isPermissionLevel(raw: unknown): raw is PermissionLevel {
  return (
    typeof raw === "string" &&
    (PERMISSION_LEVELS as readonly string[]).includes(raw)
  );
}

/** True when the database enum can currently store this level. */
export function isDbPermissionLevel(
  level: PermissionLevel,
): level is PermissionLevel & DbPermissionLevel {
  return (DB_PERMISSION_LEVELS as readonly string[]).includes(level);
}

/**
 * Narrow a code-ladder level to something the database will accept. Throws by
 * name with the remedy rather than letting Postgres reject the write later with
 * `invalid input value for enum public.permission_level`.
 */
export function toDbPermissionLevel(level: PermissionLevel): DbPermissionLevel {
  if (isDbPermissionLevel(level)) return level;
  throw new Error(
    `Permission level "${level}" is not in the database enum public.permission_level ` +
      `(it holds ${DB_PERMISSION_LEVELS.join(", ")}). Apply ` +
      `ALTER TYPE public.permission_level ADD VALUE '${level}' and regenerate ` +
      `types with \`pnpm db-types\` before granting this level.`,
  );
}

/**
 * Read a level off an untyped payload. An unrecognised value is ANNOUNCED and
 * returns `null` — the caller decides what an unknown level means rather than
 * inheriting a silent downgrade to `viewer`.
 */
export function parsePermissionLevel(
  raw: unknown,
  context: string,
): PermissionLevel | null {
  if (isPermissionLevel(raw)) return raw;
  if (raw === null || raw === undefined) return null;
  console.error(
    `[permissions] ${context}: unrecognised permission level ${JSON.stringify(raw)}. ` +
      `Known levels are ${PERMISSION_LEVELS.join(", ")}. Add it to PERMISSION_LEVELS ` +
      `in utils/permissions/levels.ts if the database gained a new value.`,
  );
  return null;
}

/**
 * Rank a level. An unknown value is ANNOUNCED and ranked `NaN`, so every
 * comparison against it is false and access is denied — the same safe outcome
 * the old `undefined >= n` produced, but no longer without a trace.
 */
export function permissionLevelRank(level: PermissionLevel): number {
  const rank = PERMISSION_LEVEL_RANK[level];
  if (rank === undefined) {
    console.error(
      `[permissions] no rank for permission level ${JSON.stringify(level)}. ` +
        `Add it to PERMISSION_LEVELS in utils/permissions/levels.ts.`,
    );
    return Number.NaN;
  }
  return rank;
}
