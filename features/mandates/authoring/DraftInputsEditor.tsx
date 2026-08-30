"use client";

// features/mandates/authoring/DraftInputsEditor.tsx
//
// Descriptive inputs — the pre-code input list. Arman: "when the code hasn't
// been written yet, realistically what you have is descriptions of inputs…
// I can't give you snake case… it would be silly to assume it's only gonna be
// one variable." So: an add-row list where the DESCRIPTION is the field, and
// name/kind are optional — "formalize later" is the default state, shown
// honestly, never demanded up front.

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DraftInput } from "./service";

export function DraftInputsEditor({
  items,
  onChange,
  autoFocusNew = false,
}: {
  items: DraftInput[];
  onChange: (next: DraftInput[]) => void;
  autoFocusNew?: boolean;
}) {
  const update = (index: number, patch: Partial<DraftInput>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };
  const add = () => onChange([...items, { description: "" }]);

  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={item.description}
            onChange={(e) => update(index, { description: e.target.value })}
            placeholder="Describe an input — e.g. current agent system prompt"
            className="h-8 flex-1 text-[13px]"
            autoFocus={autoFocusNew && index === items.length - 1 && !item.description}
            aria-label={`Input ${index + 1} description`}
          />
          <Input
            value={item.name ?? ""}
            onChange={(e) => update(index, { name: e.target.value || undefined })}
            placeholder="name — later"
            className="h-8 w-32 font-mono text-[11.5px] max-sm:hidden"
            aria-label={`Input ${index + 1} name (optional)`}
          />
          <Input
            value={item.kind ?? ""}
            onChange={(e) => update(index, { kind: e.target.value || undefined })}
            placeholder="kind — later"
            className="h-8 w-28 font-mono text-[11.5px] max-md:hidden"
            aria-label={`Input ${index + 1} kind (optional)`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={() => remove(index)}
            aria-label={`Remove input ${index + 1}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[12px]"
          onClick={add}
        >
          <Plus className="h-3.5 w-3.5" />
          Add input
        </Button>
        {items.length > 0 ? (
          <span className="text-[11px] text-muted-foreground/70">
            Names and kinds can wait — descriptions are enough to create.
          </span>
        ) : null}
      </div>
    </div>
  );
}
