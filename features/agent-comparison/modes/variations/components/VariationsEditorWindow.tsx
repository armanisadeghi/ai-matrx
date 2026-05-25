"use client";

/**
 * VariationsEditorWindow
 *
 * The consolidated editor for the Variations mode. Instead of an inline
 * per-column editor (the approach the other synthetic-fork modes take), the
 * full Agent Builder left panel is large, so every variation gets its own
 * TAB inside a single floating WindowPanel. Each tab renders the real
 * `AgentBuilderLeftPanel` pointed at that variation's synthetic agent id —
 * so the user edits everything the Agent Builder exposes (model, settings,
 * system prompt, seed messages, variables, context slots, tools, MCP) and
 * those edits flow into the variation's manual run with no special routing.
 *
 * Nothing here persists to the agents table: the panel's editing components
 * dispatch Redux-only field setters, and the synthetic `cmp-` ids are
 * structurally gated out of every save thunk.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { AgentBuilderLeftPanel } from "@/features/agents/components/builder/AgentBuilderLeftPanel";
import { renameVariationColumn } from "../redux/slice";
import {
  addColumnToVariationsBattle,
  promoteVariationToAgent,
  removeColumnFromVariationsBattle,
} from "../redux/thunks";
import type { VariationColumn } from "../types";

interface Props {
  id: string;
  columns: VariationColumn[];
  activeColumnId: string | null;
  onActiveColumnChange: (columnId: string) => void;
  onClose: () => void;
}

export function VariationsEditorWindow({
  id,
  columns,
  activeColumnId,
  onActiveColumnChange,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const active =
    columns.find((c) => c.columnId === activeColumnId) ?? columns[0] ?? null;

  const [renameOpen, setRenameOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);

  const handleAdd = async () => {
    const newId = await dispatch(addColumnToVariationsBattle(undefined)).unwrap();
    if (newId) onActiveColumnChange(newId);
  };

  const handleRename = (name: string) => {
    if (active) {
      dispatch(renameVariationColumn({ columnId: active.columnId, label: name }));
    }
    setRenameOpen(false);
  };

  const handlePromote = async (name: string) => {
    if (!active) return;
    setPromoteBusy(true);
    try {
      const newId = await dispatch(
        promoteVariationToAgent({ columnId: active.columnId, name }),
      ).unwrap();
      setPromoteOpen(false);
      toast.success(`Saved "${name}" as a new agent`, {
        action: {
          label: "Open in builder",
          onClick: () => router.push(`/agents/${newId}/build`),
        },
      });
    } catch (err) {
      toast.error(
        `Couldn't save agent: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setPromoteBusy(false);
    }
  };

  const handleRemove = async () => {
    setRemoveConfirm(false);
    if (!active) return;
    await dispatch(
      removeColumnFromVariationsBattle({ columnId: active.columnId }),
    );
  };

  return (
    <WindowPanel
      id={id}
      title="Edit variations"
      width={760}
      height={780}
      onClose={onClose}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/20 overflow-x-auto shrink-0">
          {columns.map((col) => (
            <button
              key={col.columnId}
              type="button"
              onClick={() => onActiveColumnChange(col.columnId)}
              title={col.label}
              className={cn(
                "inline-flex items-center h-7 px-2.5 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors max-w-[160px]",
                active?.columnId === col.columnId
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span className="truncate">{col.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={handleAdd}
            title="Add a variation"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {active ? (
          <>
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card shrink-0">
              <span className="text-xs font-semibold truncate flex-1">
                {active.label}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setRenameOpen(true)}
              >
                <Pencil className="w-3.5 h-3.5" />
                Rename
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setPromoteOpen(true)}
                title="Save this variation as a real, reusable agent"
              >
                <Save className="w-3.5 h-3.5" />
                Save as agent
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-destructive hover:text-destructive"
                onClick={() => setRemoveConfirm(true)}
                title="Remove this variation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Bounded height for the builder panel's own internal scroll. */}
            <div className="flex-1 min-h-0 px-2 py-1">
              <AgentBuilderLeftPanel
                key={active.syntheticAgentId}
                agentId={active.syntheticAgentId}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div className="space-y-2 max-w-xs">
              <p className="text-sm text-muted-foreground">
                No variations yet. Add one to start editing a copy of the
                template.
              </p>
              <Button size="sm" onClick={handleAdd}>
                <Plus className="w-3.5 h-3.5" />
                Add a variation
              </Button>
            </div>
          </div>
        )}
      </div>

      <TextInputDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename variation"
        placeholder="Variation name"
        defaultValue={active?.label ?? ""}
        confirmLabel="Rename"
        onConfirm={handleRename}
      />

      <TextInputDialog
        open={promoteOpen}
        onOpenChange={(o) => !promoteBusy && setPromoteOpen(o)}
        title="Save variation as a new agent"
        description="Creates a real, reusable agent from this variation's current configuration. The variations on this page stay unsaved."
        placeholder="New agent name"
        defaultValue={active ? `${active.label}` : ""}
        confirmLabel="Create agent"
        busy={promoteBusy}
        onConfirm={handlePromote}
      />

      <ConfirmDialog
        open={removeConfirm}
        onOpenChange={(o) => {
          if (!o) setRemoveConfirm(false);
        }}
        title="Remove this variation?"
        description="Discards this variation's edits and its streamed response. Other variations are unaffected."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </WindowPanel>
  );
}
