"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  appendPlaceholderRow,
  makeEmptyRowFromItem,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { ContextItemAddForm } from "./ContextItemAddForm";

interface AddContextItemInlineProps {
  scopeId: string;
  scopeTypeId: string;
  labelPlural: string;
}

/**
 * Inline "add a context item" affordance for the scope detail page. Owns the
 * open/closed toggle and splices a placeholder row into the values cache so the
 * new field appears instantly; the form itself is the shared ContextItemAddForm.
 */
export function AddContextItemInline({
  scopeId,
  scopeTypeId,
  labelPlural,
}: AddContextItemInlineProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!open) {
    return (
      <Button
        ref={triggerRef}
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

  return (
    <ContextItemAddForm
      scopeTypeId={scopeTypeId}
      scopeId={scopeId}
      labelPlural={labelPlural}
      onAdded={(item) =>
        dispatch(
          appendPlaceholderRow({ scopeId, row: makeEmptyRowFromItem(item) }),
        )
      }
      onClose={() => setOpen(false)}
    />
  );
}
