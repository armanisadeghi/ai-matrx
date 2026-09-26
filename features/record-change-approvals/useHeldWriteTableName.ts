"use client";

/**
 * The NAME of the table a held write is about — for the chip and the card.
 *
 * A chip that says "Held for your approval: 1 new record on b00bde4d…" names a
 * record nobody can recognise. Asked once per table through the store's own read
 * door (`tableNameFor`), under the person's own rights; while it is unknown the
 * chip simply leaves the table out rather than showing an id.
 */

import { useEffect, useState } from "react";

import { tableNameFor } from "./applyRecordChange";
import { waitTableId, type RecordChangeWait } from "./recordChangeApproval";

export function useHeldWriteTableName(wait: RecordChangeWait | null): string | null {
  const tableId = wait ? waitTableId(wait) : null;
  const [named, setNamed] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!tableId) return;
    let live = true;
    void tableNameFor(tableId).then(
      (name) => {
        if (live && name) setNamed({ id: tableId, name });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tableId]);
  if (wait?.change.change === "table") return null;
  return named && named.id === tableId ? named.name : null;
}
