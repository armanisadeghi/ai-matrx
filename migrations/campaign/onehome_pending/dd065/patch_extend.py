from mkpatch import make
TOMB = "  /** Tombstone — deletes propagate as soft-deletes so other machines can apply them. */\n  is_deleted: z.boolean().default(false),"
TOMB_NEW = "  /** Tombstone — deletes propagate as soft-deletes so other machines can apply them. */\n  deleted_at: z.string().nullable().default(null),"
make("matrx-extend", {
 "src/lib/supabase/queries.ts": [
   (TOMB, TOMB_NEW, 2),
   ("        is_deleted: false,\n", "        deleted_at: null,\n", 2),
   (".update({ is_deleted: true, updated_at: new Date().toISOString() })", ".update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })", 1),
   (".update({ is_deleted: true })", ".update({ deleted_at: new Date().toISOString() })", 1),
   ("created_at, updated_at, is_deleted'", "created_at, updated_at, deleted_at'", 2),
 ],
 "src/lib/highlights/queries.ts": [
   ("const FULL_COLUMNS = `${LIST_COLUMNS}, metadata, is_deleted`;", "const FULL_COLUMNS = `${LIST_COLUMNS}, metadata, deleted_at`;", 1),
   (".eq('is_deleted', false)", ".is('deleted_at', null)", 6),
   ("    is_deleted: false,\n", "    deleted_at: null,\n", 1),
   (".update({ is_deleted: true, updated_at: new Date().toISOString() })", ".update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })", 2),
 ],
 "src/lib/highlights/types.ts": [
   ("  is_deleted: z.boolean(),\n", "  deleted_at: z.string().nullable(),\n", 1),
   ("  is_deleted: true,\n", "  deleted_at: true,\n", 1),
 ],
 "src/lib/demos/cloud-sync.ts": [
   ("if (row.is_deleted) {", "if (row.deleted_at) {", 1),
   ("if (!row || row.is_deleted) return null;", "if (!row || row.deleted_at) return null;", 1),
 ],
 "src/lib/guidance/cloud-sync.ts": [
   ("if (row.is_deleted) {", "if (row.deleted_at) {", 1),
 ],
 "tests/unit/demo-cloud-sync.test.ts": [
   ("    is_deleted: false,\n", "    deleted_at: null,\n", 1),
   ("{ is_deleted: true, updated_at:", "{ deleted_at: new Date(UPDATED + 5_000).toISOString(), updated_at:", 1),
   ("rowFor(makeDemo(), { is_deleted: true })", "rowFor(makeDemo(), { deleted_at: '2026-08-09T12:00:00.000Z' })", 1),
 ],
 "tests/unit/guidance-cloud-sync.test.ts": [
   ("    is_deleted: false,\n", "    deleted_at: null,\n", 2),
 ],
 "src/lib/destructive/operations.ts": [
   ("(an UPDATE that sets `is_deleted`)", "(an UPDATE that sets `deleted_at`)", 1),
 ],
}, "dd065-batch1-matrx-extend.patch")
