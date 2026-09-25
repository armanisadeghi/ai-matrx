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
 * TWO MODES for writes that carry an extra condition (coordinator ruling,
 * 2026-09-25):
 *
 * - IDEMPOTENT (`alreadyDone`): an archive filtered `.is("deleted_at", null)`
 *   writes zero rows when the record is ALREADY archived — and also when RLS
 *   refused. On zero rows the primitive re-reads the row by id: visible and
 *   already in the target state → success (the re-read row is returned);
 *   invisible or still live → the plain refusal.
 *
 * - COMPARE-AND-SET (`compareAndSet: true`): `.eq("status", "pending")`,
 *   `.is("answered_at", null)`… zero rows means someone else got there first.
 *   That is still told to the person: "This answer was already handled —
 *   refresh to see the latest." (`WriteDidNotLandError.reason === "taken"`).
 *
 * Optimistic-concurrency edits with a `version` token use `guardedUpdate`
 * from `@ai-matrx/data/db`, which classifies zero rows as conflict or gone.
 * A bulk `.in(...)` write is not a single-record write.
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

export interface WriteOneOptions<Row = unknown> {
  /** What the person asked for: "delete", "save", "archive"… */
  action: WriteOneAction;
  /** What it is, in the person's words: "card", "note", "saved view". */
  noun: string;
  /**
   * Idempotent mode. On zero rows, `reread()` the record by id (end it in
   * `.maybeSingle()`); when it is visible and `isDone(row)`, the write is a
   * success and that row is returned. Otherwise the plain refusal.
   */
  alreadyDone?: {
    reread: () => PromiseLike<{ data: Row | null; error: unknown }>;
    isDone: (row: Row) => boolean;
  };
  /** Compare-and-set mode: zero rows means someone else got there first. */
  compareAndSet?: boolean;
}

/** Why nothing was written: refused/gone, or another writer took it first. */
export type WriteDidNotLandReason = "refused" | "taken";

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
  readonly reason: WriteDidNotLandReason;

  constructor(
    { action, noun }: Pick<WriteOneOptions, "action" | "noun">,
    reason: WriteDidNotLandReason = "refused",
  ) {
    super({
      status: reason === "taken" ? 409 : 403,
      serverMessage:
        reason === "taken"
          ? `This ${noun} was already handled — refresh to see the latest.`
          : `Nothing was ${PAST[action]}: this ${noun} no longer exists, or your access does not allow ${GERUND[action]} it.`,
      technical:
        reason === "taken"
          ? `writeOne(${action} ${noun}) compare-and-set matched 0 rows — another writer got there first`
          : `writeOne(${action} ${noun}) matched 0 rows — RLS refused or the row is gone`,
    });
    this.name = "WriteDidNotLandError";
    this.action = action;
    this.noun = noun;
    this.reason = reason;
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
  options: WriteOneOptions<Row>,
): Promise<Row> {
  const { data, error } = await write;
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return data[0];

  if (options.alreadyDone) {
    const current = await options.alreadyDone.reread();
    if (current.error) throw current.error;
    const row = Array.isArray(current.data) ? (current.data[0] as Row | undefined) : current.data;
    if (row && options.alreadyDone.isDone(row)) return row;
  }
  throw new WriteDidNotLandError(options, options.compareAndSet ? "taken" : "refused");
}

export type TryWriteOneResult<Row> =
  | { row: Row; error: null }
  | { row: null; error: Error };

/** `writeOne` for services that return results instead of throwing. */
export async function tryWriteOne<Row>(
  write: PromiseLike<RowsResponse<Row>>,
  options: WriteOneOptions<Row>,
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
