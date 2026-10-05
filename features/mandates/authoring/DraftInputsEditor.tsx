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
import { Input } from "@ai-matrx/design-system/controls";
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
            className="flex-1"
            autoFocus={autoFocusNew && index === items.length - 1 && !item.description}
            aria-label={`Input ${index + 1} description`}
          />
          <Input
            value={item.name ?? ""}
            onChange={(e) => update(index, { name: e.target.value || undefined })}
            placeholder="Name (optional)"
            className="w-32 max-sm:hidden"
            aria-label={`Input ${index + 1} name (optional)`}
          />
          {/* D2 — one example, so whoever binds this job later can SEE what
              this input carries instead of guessing from its description
              (UI-STANDARD P5). Optional like name and kind: an illustration
              nothing reads at run time. */}
          <Input
            value={item.example ?? ""}
            onChange={(e) => update(index, { example: e.target.value || undefined })}
            placeholder="Example (optional)"
            className="w-40 max-lg:hidden"
            aria-label={`Input ${index + 1} example (optional)`}
          />
          <Input
            value={item.kind ?? ""}
            onChange={(e) => update(index, { kind: e.target.value || undefined })}
            placeholder="Format (optional)"
            className="w-28 max-md:hidden"
            aria-label={`Input ${index + 1} kind (optional)`}
          />
          <Button
            icon={<X />}
            variant="quiet"
            className="shrink-0"
            onClick={() => remove(index)}
            aria-label={`Remove input ${index + 1}`}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          icon={<Plus />}
          variant="outline"
          onClick={add}
        >
          Add input
        </Button>
        {items.length > 0 ? (
          <span className="text-[11px] text-muted-foreground/70">
            A description is enough to create.
          </span>
        ) : null}
      </div>
    </div>
  );
}
