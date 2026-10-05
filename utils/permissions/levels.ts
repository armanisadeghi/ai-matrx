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
import type { DbPermissionLevel } from "@ai-matrx/chat/ui/permission-levels";

export * from "@ai-matrx/chat/ui/permission-levels";

/**
 * The values `public.permission_level` holds RIGHT NOW, read from the generated
 * constants rather than re-typed here, so it widens by regeneration alone.
 */
export const DB_PERMISSION_LEVELS: readonly DbPermissionLevel[] =
  Constants.public.Enums.permission_level;

