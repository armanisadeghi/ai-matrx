"use client";

/**
 * AxisEditor — one axis (rows or columns): its name, its variants, and for
 * each variant the fields it overrides. Paste turns many prompts into rows at
 * once (one per line, or blank-line separated blocks).
 */

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { parsePastedPrompts, patchFieldLabels } from "../model";
import {
  addPromptVariants,
  addVariant,
  duplicateVariant,
  moveVariant,
  removeVariant,
  setAxisLabel,
  setVariantLabel,
  setVariantPatch,
} from "../redux/slice";
import { selectMatrixBase, selectMatrixColumns, selectMatrixRows } from "../redux/selectors";
import { PatchEditor } from "./PatchEditor";
import type { MatrixAxisKey, MatrixVariant } from "../types";

export function AxisEditor({ axis }: { axis: MatrixAxisKey }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(axis === "rows" ? selectMatrixRows : selectMatrixColumns);
  const base = useAppSelector(selectMatrixBase);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 h-10 px-3 border-b border-border">
        <span className="type-meta uppercase tracking-wider font-semibold text-muted-foreground shrink-0">
          {axis === "rows" ? "Rows" : "Columns"}
        </span>
        <input
          value={data.label}
          onChange={(e) => dispatch(setAxisLabel({ axis, label: e.target.value }))}
          aria-label={`${axis === "rows" ? "Rows" : "Columns"} name`}
          className="w-40 h-7 px-2 rounded border border-transparent hover:border-border focus:border-border bg-transparent text-sm font-medium"
        />
        <span className="type-secondary text-muted-foreground tabular-nums">{data.variants.length}</span>
        <div className="flex-1" />
        <Button
          icon={<ClipboardPaste />}
          variant="quiet"
          onClick={() => setPasteOpen(true)}
          title="Paste many prompts, one per row"
        >
          Paste
        </Button>
        <Button
          icon={<Plus />}
          variant="quiet"
          onClick={() => dispatch(addVariant({ axis }))}
          title={`Add one to ${data.label || axis}`}
        >
          Add
        </Button>
      </header>

      {data.variants.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-6">
          <Button icon={<ClipboardPaste />} variant="outline" onClick={() => setPasteOpen(true)}>
            Paste prompts
          </Button>
          <Button icon={<Plus />} variant="outline" onClick={() => dispatch(addVariant({ axis }))}>
            Add one
          </Button>
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {data.variants.map((v, i) => (
            <VariantRow
              key={v.id}
              axis={axis}
              variant={v}
              index={i}
              count={data.variants.length}
              expanded={!!open[v.id]}
              onToggle={() => setOpen((o) => ({ ...o, [v.id]: !o[v.id] }))}
              inheritedAgentId={base.agent_id}
            />
          ))}
        </ol>
      )}

      <PasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        title={`Paste into ${data.label || (axis === "rows" ? "rows" : "columns")}`}
        onConfirm={(prompts) => {
          dispatch(addPromptVariants({ axis, prompts }));
          setPasteOpen(false);
        }}
      />
    </section>
  );
}

function VariantRow({
  axis,
  variant,
  index,
  count,
  expanded,
  onToggle,
  inheritedAgentId,
}: {
  axis: MatrixAxisKey;
  variant: MatrixVariant;
  index: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  inheritedAgentId?: string;
}) {
  const dispatch = useAppDispatch();
  const chips = patchFieldLabels(variant.patch);
  return (
    <li className="px-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Edit overrides"}
          title={expanded ? "Collapse" : "Edit overrides"}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="w-6 shrink-0 text-right type-meta tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        <input
          value={variant.label}
          onChange={(e) =>
            dispatch(setVariantLabel({ axis, id: variant.id, label: e.target.value }))
          }
          aria-label="Name"
          className="w-56 max-w-[40%] h-7 px-2 rounded border border-transparent hover:border-border focus:border-border bg-transparent text-sm truncate"
        />
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
          {chips.length === 0 ? (
            <span className="type-meta text-muted-foreground/70">Base only</span>
          ) : (
            chips.map((c) => (
              <span
                key={c}
                className="shrink-0 h-5 px-1.5 rounded bg-primary/10 text-primary type-meta font-medium inline-flex items-center"
              >
                {c}
              </span>
            ))
          )}
        </div>
        <IconBtn label="Move up" disabled={index === 0} onClick={() => dispatch(moveVariant({ axis, id: variant.id, delta: -1 }))}>
          <ArrowUp className="w-3.5 h-3.5" />
        </IconBtn>
        <IconBtn label="Move down" disabled={index === count - 1} onClick={() => dispatch(moveVariant({ axis, id: variant.id, delta: 1 }))}>
          <ArrowDown className="w-3.5 h-3.5" />
        </IconBtn>
        <IconBtn label="Duplicate" onClick={() => dispatch(duplicateVariant({ axis, id: variant.id }))}>
          <Copy className="w-3.5 h-3.5" />
        </IconBtn>
        <IconBtn label="Remove" destructive onClick={() => dispatch(removeVariant({ axis, id: variant.id }))}>
          <Trash2 className="w-3.5 h-3.5" />
        </IconBtn>
      </div>
      {expanded && (
        <div className="mt-1.5 ml-14 mr-2 pb-1">
          <PatchEditor
            patch={variant.patch}
            inheritedAgentId={inheritedAgentId}
            onChange={(patch) => dispatch(setVariantPatch({ axis, id: variant.id, patch }))}
          />
        </div>
      )}
    </li>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30",
        destructive && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function PasteDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  onConfirm: (prompts: string[]) => void;
}) {
  const [text, setText] = useState("");
  const prompts = parsePastedPrompts(text);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setText("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder="One prompt per line, or separate prompts with a blank line"
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono resize-y"
        />
        <DialogFooter className="items-center">
          <span className="mr-auto type-secondary text-muted-foreground tabular-nums">
            {prompts.length} {prompts.length === 1 ? "prompt" : "prompts"}
          </span>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={prompts.length === 0}
            onClick={() => {
              onConfirm(prompts);
              setText("");
            }}
          >
            Add {prompts.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
