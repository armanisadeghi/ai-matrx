/**
 * writeOne — THE single-record write that PROVES it landed.
 *
 * THE CLASS (flashcards, 2026-09-25). PostgREST answers an `.update()` or
 * `.delete()` that row-level security filters to zero rows with
 * `{ data: [], error: null }` — status 200, no error. A caller that judges
 * success by `error == null` therefore tells the person "Card deleted" while
 * nothing happened. The same is true when the row is already gone. Nothing
 * fails silently: zero rows written is a refusal, and it is said in words.
 *
 * USE IT for every write aimed at ONE record (`.eq("id", …)`):
 *
 *   await writeOne(
 *     supabase.from("notes").update({ label }).eq("id", noteId).select("id"),
 *     { action: "rename", noun: "note" },
 *   );
 *
 * - The builder MUST end in `.select(...)` — that is what makes PostgREST
 *   return the rows it actually wrote. Select only what you need (`"id"` is
 *   fine); the first written row is returned.
 * - A database error is thrown AS IS (the PostgrestError), so existing error
 *   handling and `describeWriteFailure` keep working.
 * - Zero rows throws `WriteDidNotLandError` — a `WriteRefusedError` whose
 *   message is already a sentence for a person:
 *   "Nothing was deleted: this card no longer exists, or your access does not
 *   allow deleting it."
 * - `tryWriteOne` is the same check for result-style services that never
 *   throw: it returns `{ row, error }`.
 *
 * NOT for writes whose zero-row answer is legitimate (a conditional claim
 * `.is("claimed_by", null)`, an idempotent "mark viewed", a bulk `.in(...)`):
 * those read their own `.select()` rows and decide. Optimistic-concurrency
 * edits use `guardedUpdate` from `@ai-matrx/data/db`, which already classifies
 * zero rows as conflict or gone.
 *
 * Guard: `pnpm check:single-record-writes` (scripts/check-single-record-writes.ts)
 * fails on a new single-record update/delete that judges success by error alone.
 */
import { WriteRefusedError } from "@/lib/errors/writeFailure";

/** The verb the person asked for. Drives the refusal sentence. */
export type WriteOneAction =
  | "save"
  | "update"
  | "rename"
  | "move"
  | "delete"
  | "remove"
  | "archive"
  | "restore"
  | "publish"
  | "unpublish"
  | "change";

export interface WriteOneOptions {
  /** What the person asked for: "delete", "save", "archive"… */
  action: WriteOneAction;
  /** What it is, in the person's words: "card", "note", "saved view". */
  noun: string;
}

const PAST: Record<WriteOneAction, string> = {
  save: "saved",
  update: "updated",
  rename: "renamed",
  move: "moved",
  delete: "deleted",
  remove: "removed",
  archive: "archived",
  restore: "restored",
  publish: "published",
  unpublish: "unpublished",
  change: "changed",
};

const GERUND: Record<WriteOneAction, string> = {
  save: "saving",
  update: "updating",
  rename: "renaming",
  move: "moving",
  delete: "deleting",
  remove: "removing",
  archive: "archiving",
  restore: "restoring",
  publish: "publishing",
  unpublish: "unpublishing",
  change: "changing",
};

/** Zero rows were written: the record is gone, or the person may not change it. */
export class WriteDidNotLandError extends WriteRefusedError {
  readonly action: WriteOneAction;
  readonly noun: string;

  constructor({ action, noun }: WriteOneOptions) {
    super({
      status: 403,
      serverMessage: `Nothing was ${PAST[action]}: this ${noun} no longer exists, or your access does not allow ${GERUND[action]} it.`,
      technical: `writeOne(${action} ${noun}) matched 0 rows — RLS refused or the row is gone`,
    });
    this.name = "WriteDidNotLandError";
    this.action = action;
    this.noun = noun;
  }
}

/** Structural shape of an awaited supabase-js builder that ended in `.select()`. */
interface RowsResponse<Row> {
  data: Row[] | null;
  error: unknown;
}

/**
 * Run a single-record write and prove it landed. Returns the first written
 * row; throws the database error as is, or `WriteDidNotLandError` on zero rows.
 */
export async function writeOne<Row>(
  write: PromiseLike<RowsResponse<Row>>,
  options: WriteOneOptions,
): Promise<Row> {
  const { data, error } = await write;
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new WriteDidNotLandError(options);
  }
  return data[0];
}

export type TryWriteOneResult<Row> =
  | { row: Row; error: null }
  | { row: null; error: Error };

/** `writeOne` for services that return results instead of throwing. */
export async function tryWriteOne<Row>(
  write: PromiseLike<RowsResponse<Row>>,
  options: WriteOneOptions,
): Promise<TryWriteOneResult<Row>> {
  try {
    return { row: await writeOne(write, options), error: null };
  } catch (caught) {
    if (caught instanceof Error) return { row: null, error: caught };
    const message =
      caught && typeof caught === "object" && "message" in caught && typeof caught.message === "string"
        ? caught.message
        : String(caught);
    const error = new Error(message);
    (error as Error & { cause?: unknown }).cause = caught;
    return { row: null, error };
  }
}
