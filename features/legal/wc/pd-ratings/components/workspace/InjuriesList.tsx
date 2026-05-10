"use client";

import * as React from "react";
import { Plus, Activity, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InjuriesTable, rowsToTsv, type InjuryRowData } from "./InjuriesTable";
import { InjuryEditor } from "./InjuryEditor";
import { useImpairmentDefinition } from "./ImpairmentSearch";
import { useImpairments } from "../../api/hooks";
import type { InjuryDraft } from "../../state/types";
import type {
  StatelessRatingResponse,
  WcImpairmentDefinitionRead,
} from "../../api/types";

interface InjuriesListProps {
  injuries: InjuryDraft[];
  onAdd: (seed?: Partial<InjuryDraft>) => string;
  onUpdate: (tmpId: string, patch: Partial<InjuryDraft>) => void;
  onRemove: (tmpId: string) => void;
  liveResult?: StatelessRatingResponse | null;
  className?: string;
}

export function InjuriesList({
  injuries,
  onAdd,
  onUpdate,
  onRemove,
  liveResult,
  className,
}: InjuriesListProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [newlyAddedId, setNewlyAddedId] = React.useState<string | null>(null);
  const { data: catalog } = useImpairments();

  const editing = injuries.find((i) => i.tmpId === editingId);

  const warningsByIndex = React.useMemo(() => {
    const map = new Map<number, string[]>();
    if (!liveResult?.injuries) return map;
    liveResult.injuries.forEach((inj, idx) => {
      if (inj.warnings.length > 0) map.set(idx, inj.warnings);
    });
    return map;
  }, [liveResult]);

  const rows = React.useMemo<InjuryRowData[]>(() => {
    return injuries.map((injury, idx) => {
      const definition =
        injury.impairment_definition_id && catalog?.impairments
          ? (catalog.impairments[injury.impairment_definition_id] ?? null)
          : null;
      return {
        injury,
        definition,
        warnings: warningsByIndex.get(idx) ?? [],
      };
    });
  }, [injuries, catalog, warningsByIndex]);

  const handleAdd = () => {
    const id = onAdd();
    setNewlyAddedId(id);
    setEditingId(id);
  };

  const handleClose = () => {
    setEditingId(null);
    setNewlyAddedId(null);
  };

  const handleDelete = () => {
    if (editingId) onRemove(editingId);
    setEditingId(null);
    setNewlyAddedId(null);
  };

  const handleCopyAll = async () => {
    if (rows.length === 0) return;
    const tsv = rowsToTsv(rows);
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success(`Copied ${rows.length} injuries`, {
        description: "Tab-separated — paste into Excel or Sheets.",
      });
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="rounded-md bg-primary/10 p-1.5 ring-1 ring-primary/15 shrink-0">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Injuries
            </h2>
            <p className="text-xs text-muted-foreground">
              {injuries.length === 0
                ? "Add impairments from the medical evaluation."
                : `${injuries.length} ${
                    injuries.length === 1 ? "injury" : "injuries"
                  } · click any row to edit.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {injuries.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyAll}
                  className="gap-1.5 h-8"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy all
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Copy all rows as TSV (paste into Excel / Sheets)
              </TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            className="gap-1.5 h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            Add injury
          </Button>
        </div>
      </header>

      {injuries.length === 0 ? (
        <EmptyInjuries onAdd={handleAdd} />
      ) : (
        <InjuriesTable rows={rows} onEdit={setEditingId} onDelete={onRemove} />
      )}

      {editing && (
        <InjuryEditorWrapper
          injury={editing}
          isNew={editing.tmpId === newlyAddedId}
          onChange={(patch) => onUpdate(editing.tmpId, patch)}
          onClose={handleClose}
          onDelete={editing.tmpId === newlyAddedId ? undefined : handleDelete}
        />
      )}
    </section>
  );
}

function InjuryEditorWrapper({
  injury,
  isNew,
  onChange,
  onClose,
  onDelete,
}: {
  injury: InjuryDraft;
  isNew: boolean;
  onChange: (patch: Partial<InjuryDraft>) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const resolvedDefinition = useImpairmentDefinition(
    injury.impairment_definition_id,
  );

  return (
    <InjuryEditor
      open
      injury={injury}
      onChange={onChange}
      onClose={onClose}
      onDelete={onDelete}
      onSelectImpairment={(def: WcImpairmentDefinitionRead | null) => {
        if (!def?.id) {
          onChange({ impairment_definition_id: null });
          return;
        }
        const patch: Partial<InjuryDraft> = {
          impairment_definition_id: def.id,
        };
        if (!def.attributes.wpi) patch.wpi = null;
        if (!def.attributes.ue) patch.ue = null;
        if (!def.attributes.le) patch.le = null;
        if (!def.attributes.digit) patch.digit = null;
        if (!def.attributes.side) patch.side = "default";
        onChange(patch);
      }}
      resolvedDefinition={resolvedDefinition}
      isNew={isNew}
    />
  );
}

function EmptyInjuries({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "w-full rounded-xl border border-dashed border-border bg-muted/30",
        "px-6 py-10 text-center transition-colors",
        "hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      <Plus className="h-5 w-5 mx-auto text-muted-foreground" />
      <p className="mt-2 text-sm font-medium text-foreground">
        Add your first injury
      </p>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
        Search the AMA Guides catalog and enter the percentages from the medical
        evaluation.
      </p>
    </button>
  );
}
