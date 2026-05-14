"use client";

import { useState } from "react";
import { Plus, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createContextItem } from "@/features/scope-system/redux/contextItemsSlice";
import {
  appendPlaceholderRow,
  makeEmptyRowFromItem,
  setScopeContextValue,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { slugifyKey } from "@/features/scope-system/utils/slugify";

interface AddContextItemInlineProps {
  scopeId: string;
  scopeTypeId: string;
  labelPlural: string;
}

export function AddContextItemInline({
  scopeId,
  scopeTypeId,
  labelPlural,
}: AddContextItemInlineProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const item = await dispatch(
        createContextItem({
          scope_type_id: scopeTypeId,
          key: slugifyKey(name) || name.toLowerCase(),
          display_name: name.trim(),
        }),
      ).unwrap();

      dispatch(
        appendPlaceholderRow({
          scopeId,
          row: makeEmptyRowFromItem(item),
        }),
      );

      if (value.trim()) {
        await dispatch(
          setScopeContextValue({
            scope_id: scopeId,
            context_item_id: item.id,
            value_text: value.trim(),
          }),
        ).unwrap();
      }

      toast.success(`Added “${item.display_name}” to all ${labelPlural}`);
      setName("");
      setValue("");
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add context item",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add context item
      </Button>
    );
  }

  const key = name.trim() ? slugifyKey(name) : "";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3"
    >
      <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Adds to <strong>all {labelPlural}</strong> — define the column once,
          fill in values everywhere.
        </span>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Context item name
        </label>
        <Input
          autoFocus
          placeholder="e.g. Knowledge cutoff"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          style={{ fontSize: "16px" }}
        />
        {key && (
          <p className="text-[10px] font-mono text-muted-foreground">{key}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Value for this one (optional)
        </label>
        <ProTextarea
          placeholder="Leave blank to fill later"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          minHeight={80}
          autoGrow
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setName("");
            setValue("");
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Add context item
        </Button>
      </div>
    </form>
  );
}
