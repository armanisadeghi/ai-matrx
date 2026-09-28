// lib/entity-list/lookalikes.ts
//
// NO TWO ROWS IN A LIST ARE INDISTINGUISHABLE.
//
// Duplicate names are ALLOWED across this platform — Notion and Linear both
// allow two databases or two issues to carry one title, and refusing a name
// somebody chose is a worse product than allowing it. The other half of
// allowing it is SAYING it: a list that prints the same words on three rows
// and nothing else hands the person a coin flip.
//
// Cold walk 21 (jobs-bar-2026-09-16, defect D) read three rows on
// /masterwork/all all saying `walk21-Repaint or Recoat Verdict`, separable
// only by squinting at their goal sentence and their age. This is the shared
// answer for every list built on `EntityListPage`: given the rows a view is
// about to render, it returns a short distinguishing note for the rows whose
// primary line reads the same as another's, and NOTHING for the rows that are
// already unique — the note appears exactly where it is needed and never adds
// noise to a list of unique names.
//
// The note is built from facts the row already carries, never invented: its
// creation moment (escalating from the date to the date and the minute when
// twins were made on one day) plus one extra detail the caller supplies when
// that detail actually differs inside the group (for a Rulebook, what it was
// built from). Rows with no usable fact get no note rather than a fabricated
// one — a list that cannot tell two rows apart must not pretend it can.

export interface LookalikeRow {
  id: string;
  /** The primary line a person scans — the name on the row. */
  name: string;
  /** ISO timestamp the row was created, when the list has one. */
  createdAt?: string | null;
  /**
   * One more fact that may separate twins (a source summary, an author, an
   * owner). Used only when it is present and differs inside the group.
   */
  detail?: string | null;
}

/** Same words to a person: case, surrounding space and inner runs ignored. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDay(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDayAndMinute(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = formatDay(iso);
  if (!day) return null;
  const minute = at.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} at ${minute}`;
}

/**
 * The distinguishing note per row id, for the rows that need one.
 *
 * @param rows  The rows this view is about to render — the note is scoped to
 *              what is ON SCREEN, because that is where the confusion is.
 * @param startedWord  The verb this entity is created with ("Started" for a
 *              Rulebook, "Created" for most things).
 */
export function lookalikeNotes(
  rows: readonly LookalikeRow[],
  startedWord = "Created",
): Map<string, string> {
  const groups = new Map<string, LookalikeRow[]>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    // A row with no name at all is not a lookalike of another nameless row in
    // any way a note could fix; leave the empty key out of the grouping.
    if (key === "") continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const notes = new Map<string, string>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Does the extra detail separate every member on its own? Only then is it
    // worth printing as the distinguishing fact — two rows both reading
    // "1 interview · 5 documents" are no better off for saying so.
    const details = group.map((row) => row.detail?.trim() ?? "");
    const detailSeparates =
      details.every((detail) => detail !== "") &&
      new Set(details).size === group.length;

    // The creation moment is the fact every row has. Escalate to the minute
    // only when the day is shared — a person reading twins made a week apart
    // does not need a clock.
    const days = group.map((row) =>
      row.createdAt ? formatDay(row.createdAt) : null,
    );
    const dayIsEnough =
      days.every((day) => day !== null) && new Set(days).size === group.length;

    for (let index = 0; index < group.length; index += 1) {
      const row = group[index];
      const parts: string[] = [];

      if (row.createdAt) {
        const when = dayIsEnough
          ? days[index]
          : formatDayAndMinute(row.createdAt);
        if (when) parts.push(`${startedWord} ${when}`);
      }
      if (detailSeparates) parts.push(details[index]);

      // Nothing true to say — say nothing. A fabricated tiebreaker would be
      // worse than the ambiguity it papers over.
      if (parts.length > 0) notes.set(row.id, parts.join(" · "));
    }
  }

  return notes;
}

/**
 * What a LIST says about its rows so twins can be told apart — declared once
 * per surface on `EntityListConfig.lookalike` and read by EVERY view (the
 * table's name cell, the cards, the rows), so there is one rule, not one per
 * view. Cold walk 22 (defect D): the card view separated two same-named
 * Rulebooks to the minute while the default TABLE printed them as the same
 * row twice, because a table cell cannot see its neighbours.
 */
export interface LookalikeSpec<TRow> {
  /** ISO creation time. Defaults to the row's own `created_at` when it has one. */
  createdAt?: (row: TRow) => string | null | undefined;
  /** One more fact that may separate twins (what it was built from, an owner). */
  detail?: (row: TRow) => string | null | undefined;
  /** The verb this entity is created with. Default "Created". */
  startedWord?: string;
}

function ownCreatedAt(row: unknown): string | null {
  if (row && typeof row === "object") {
    const value = (row as Record<string, unknown>).created_at;
    if (typeof value === "string") return value;
  }
  return null;
}

/** The notes for the rows a view renders, by the list's declared spec. */
export function lookalikeNotesFor<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow) => string,
  getRowName: (row: TRow) => string,
  spec: LookalikeSpec<TRow> | undefined,
): Map<string, string> {
  return lookalikeNotes(
    rows.map((row) => ({
      id: getRowId(row),
      name: getRowName(row),
      createdAt: spec?.createdAt ? spec.createdAt(row) : ownCreatedAt(row),
      detail: spec?.detail?.(row) ?? null,
    })),
    spec?.startedWord ?? "Created",
  );
}
