"use client";

// A GFM task checkbox (`- [ ]` / `- [x]`). Interactive only when the document
// carries a save adapter (MarkdownSourceEditProvider): a click toggles that
// one line in the stored source through the splice API. Without an adapter
// it is a read-only state mark — full contrast, no pointer, no hover — never
// a control that looks clickable and does nothing.

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useMarkdownSourceEdit } from "./MarkdownSourceEdit";

interface TaskCheckboxProps {
  checked?: boolean;
  "data-task-index"?: number | string;
  "data-task-text"?: string;
}

const BOX = "mr-2 inline-flex h-4 w-4 shrink-0 translate-y-[2px] items-center justify-center rounded-[4px] border align-baseline";

export function TaskCheckbox(props: TaskCheckboxProps) {
  const edit = useMarkdownSourceEdit();
  const [pending, setPending] = useState(false);
  const checked = !!props.checked;
  const index = Number(props["data-task-index"] ?? 0);
  const itemText = String(props["data-task-text"] ?? "");

  const mark = checked ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null;
  const stateClass = checked
    ? "border-primary bg-primary text-primary-foreground"
    : "border-muted-foreground/60 bg-background";

  if (!edit) {
    return (
      <span
        role="img"
        aria-label={checked ? "Done" : "Not done"}
        data-task-readonly=""
        className={cn(BOX, stateClass)}
      >
        {mark}
      </span>
    );
  }

  const onToggle = async () => {
    if (pending) return;
    // The tokenizer loads on the first toggle, never with the renderer.
    const { toggleTaskInSource } = await import("../task-source");
    const next = toggleTaskInSource(edit.source, { text: itemText, index, checked: !checked });
    if (next === null) {
      toast.error("This task could not be found in the saved text, so nothing was changed. Edit the source to update it.");
      return;
    }
    setPending(true);
    try {
      await edit.save(next);
    } catch (err) {
      toast.error(`The task was not saved: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Mark as not done" : "Mark as done"}
      aria-busy={pending || undefined}
      data-task-interactive=""
      onClick={onToggle}
      className={cn(BOX, stateClass, "cursor-pointer transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pending && "opacity-60")}
    >
      {mark}
    </button>
  );
}
