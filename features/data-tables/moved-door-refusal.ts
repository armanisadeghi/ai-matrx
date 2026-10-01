/**
 * A CLOSED OLDER DOOR, SAID IN A PERSON'S WORDS (lane POST-PRESS-SENTENCES, 2026-10-01).
 *
 * The final switch's press revokes EXECUTE on the 23 older data-table write doors from every
 * browser (`platform._final_switch_old_write_doors()`, read from
 * `migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql`).
 * A browser still calling one gets PostgREST's raw `42501 permission denied for function
 * add_data_row_to_user_table` — a developer error on a screen. This is the one place that error
 * becomes the sentence the database itself says over a moved table, with the table's address.
 *
 * Recognised BY DOOR NAME: the name PostgREST puts in the message must be one of the older
 * data-table doors (udt_*, *user_table*, update_field_metadata). The guard
 * `__tests__/a-closed-older-door-is-said-in-a-persons-words.test.ts` reads the press's own list
 * from the campaign file and proves every one of the 23 maps here, and that a 42501 from any
 * other function is left alone.
 */

export interface MovedDoorRefusal {
  /** The person's sentence (same words as the database's moved-table refusal). */
  message: string;
  /** Where the work lives now. */
  href: string;
  /** The door PostgREST named — for engineers, never the screen. */
  door: string;
}

const PERMISSION_DENIED = /permission denied for function (?:[a-z_]+\.)?([a-z_]+)/i;
const OLDER_DOOR = /^(udt_[a-z_]+|[a-z_]*user_table[a-z_]*|update_field_metadata)$/;
const CREATES = /^(create_new_user_table_dynamic|create_user_table_with_fields)$/;

/** The older write door a refusal names when the press has closed it to browsers, else null. */
export function closedOlderDoor(error: { message?: string | null; code?: string | null } | null | undefined): string | null {
  if (!error || error.code !== "42501") return null;
  const name = PERMISSION_DENIED.exec(error.message ?? "")?.[1]?.toLowerCase();
  return name && OLDER_DOOR.test(name) ? name : null;
}

/** The moved-table sentence for a closed older door, with the table's address; null otherwise. */
export function movedDoorRefusal(
  error: { message?: string | null; code?: string | null } | null | undefined,
  tableId?: string | null,
): MovedDoorRefusal | null {
  const door = closedOlderDoor(error);
  if (!door) return null;
  if (CREATES.test(door)) {
    return { door, href: "/data", message: "New tables are made in the new system now. Make it at /data." };
  }
  const href = tableId ? `/data/${tableId}` : "/data";
  return {
    door,
    href,
    message: tableId
      ? `This table moved to the new system when its organization switched its Data tables, so it no longer takes changes here. Make the change in its copy at ${href} (same table, same address).`
      : "This table moved to the new system when its organization switched its Data tables, so it no longer takes changes here. Open it from /data to make the change.",
  };
}

/** `error.message` unless the error is a closed older door, then the person's sentence. */
export function olderDoorErrorText(
  error: { message?: string | null; code?: string | null } | null | undefined,
  tableId?: string | null,
): string {
  return movedDoorRefusal(error, tableId)?.message ?? String(error?.message ?? "");
}

/** A thrown closed-door refusal, so a catch can print its sentence and nothing else. */
export class MovedTableError extends Error {
  readonly href: string;
  constructor(refusal: MovedDoorRefusal) {
    super(refusal.message);
    this.name = "MovedTableError";
    this.href = refusal.href;
  }
}

/** The error to throw for a failed older-door call: the moved sentence when the press closed it. */
export function olderDoorError<E>(error: E & { message?: string | null; code?: string | null }, tableId?: string | null): Error | E {
  const moved = movedDoorRefusal(error, tableId);
  return moved ? new MovedTableError(moved) : error;
}
