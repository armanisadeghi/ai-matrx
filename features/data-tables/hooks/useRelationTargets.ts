"use client";

/**
 * THE TABLES A RELATION COLUMN MAY POINT AT, for the one format picker's "Points at" (BREAKER-2 B2-07).
 * Read only while a Relation look is being set up, and only once per dialog: the tables that open
 * beside this one (its organization's tables, and the person's older ones).
 */
import { useEffect, useState } from "react";
import { listTablesBeside } from "../service";

export function useRelationTargets(tableId: string, wanted: boolean): { id: string; name: string }[] | undefined {
  const [targets, setTargets] = useState<{ id: string; name: string }[] | undefined>(undefined);
  useEffect(() => {
    if (!wanted || targets !== undefined) return;
    let live = true;
    void listTablesBeside({ tableId }).then((answer) => {
      if (!live) return;
      setTargets(
        answer.success
          ? answer.data.map((t) => ({ id: t.id, name: t.table_name || "A table" })).sort((a, b) => a.name.localeCompare(b.name))
          : [],
      );
    });
    return () => {
      live = false;
    };
  }, [tableId, wanted, targets]);
  return targets;
}
