"use client";

/**
 * SaveToTableOverlay — the host for the ONE "Save to a table" (lane SAVE-AS-TABLE-EVERYWHERE,
 * 2026-09-29). It holds no logic of its own: the screen is `@ai-matrx/records-ui`'s `SaveToTable`
 * (shape reading, the new-table columns, the import into an existing table with the enum ask), and
 * this file only decides WHERE the organization's tables live and mounts the store there.
 *
 * WHERE THE ROWS GO. Every table lives in the record store, so the rows always go there, in the
 * organization `whereANewTableIsBorn` answers (the one the person is making the table in).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecordsMount, SaveToTable } from "@ai-matrx/records-ui";
import type { SaveToTableSource } from "@ai-matrx/records-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { whereANewTableIsBorn } from "@/features/data-tables/data-source/where-a-table-is-born";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { disposeSaveToTableCallbackGroup, emitSaveToTableEvent } from "@/features/overlays/callbacks/saveToTable";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface SaveToTableOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  text?: string | null;
  value?: unknown;
  hasValue?: boolean;
  grid?: { headers: string[]; rows: string[][] } | null;
  title?: string | null;
  shapeIndex?: number;
  organizationId?: string | null;
  callbackGroupId?: string | null;
}

type Where =
  | { state: "asking" }
  | { state: "record"; organizationId: string }
  | { state: "refused"; sentence: string };

export function SaveToTableOverlay({
  isOpen,
  onClose,
  text,
  value,
  hasValue,
  grid,
  title,
  shapeIndex = 0,
  organizationId,
  callbackGroupId,
}: SaveToTableOverlayProps) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [where, setWhere] = useState<Where>({ state: "asking" });
  const recordsConfig = useAppRecordsConfig(where.state === "record" ? where.organizationId : null);

  const source: SaveToTableSource = {
    ...(grid ? { grid } : hasValue ? { value } : { text: text ?? "" }),
    title: title ?? null,
  };

  useEffect(() => {
    let live = true;
    whereANewTableIsBorn(organizationId ?? null)
      .then((born) => {
        if (!live) return;
        if (!born.ok) setWhere({ state: "refused", sentence: born.error });
        else setWhere({ state: "record", organizationId: born.home.organizationId });
      })
      .catch((err: unknown) => {
        // The person closed the organization picker: "not now" — nothing is saved, and nothing is wrong.
        if (live) onClose();
        void err;
      });
    return () => {
      live = false;
    };
  }, [organizationId, onClose]);

  useEffect(() => () => disposeSaveToTableCallbackGroup(callbackGroupId), [callbackGroupId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Save to a table</DialogTitle>
          <DialogDescription>
            Make a new table from these rows, or add them to a table you already have.
          </DialogDescription>
        </DialogHeader>
        {where.state === "asking" ? (
          <p className="text-sm text-muted-foreground">Finding where this organization keeps its tables…</p>
        ) : where.state === "refused" ? (
          <p className="text-sm text-destructive">{where.sentence}<ErrorAlchemyMenu /></p>
        ) : userId ? (
          <RecordsMount
            letTheStoreDecideRights
            config={recordsConfig}
            host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
          >
            <SaveToTable
              source={source}
              shapeIndex={shapeIndex}
              onSaved={(tableId, how) =>
                void emitSaveToTableEvent(callbackGroupId, { type: "saved", tableId, how, tableName: null })
              }
              onOpenTable={(tableId) => {
                onClose();
                router.push(`/data/${tableId}`);
              }}
              onClose={onClose}
            />
          </RecordsMount>
        ) : (
          <p className="text-sm text-muted-foreground">Sign in to save these rows as a table.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
