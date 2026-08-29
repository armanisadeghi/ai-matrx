const MAX_REMEMBERED_EDIT_ROWS = 500;

/** Retains source rows for inline drafts across server-page reconciliation. */
export class EditRowRegistry<TRow> {
  private readonly rows = new Map<string, TRow>();

  remember(rows: readonly TRow[], getRowId: (row: TRow) => string): void {
    for (const row of rows) {
      const id = getRowId(row);
      this.rows.delete(id);
      this.rows.set(id, row);
    }
    while (this.rows.size > MAX_REMEMBERED_EDIT_ROWS) {
      const oldest = this.rows.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.rows.delete(oldest);
    }
  }

  get(rowId: string): TRow | undefined {
    return this.rows.get(rowId);
  }
}
