"use client";

/**
 * AssistActionTextEditor — the reusable compact editor for text-editable
 * Assist actions. The action-specific mapping stays in runtime/action-editing;
 * this component only owns the editing interaction.
 */

import { useEffect, useRef } from "react";
import { FileCheck2, PencilLine, RotateCcw } from "lucide-react";
import {
  ProTextarea,
  type ProTextareaElement,
} from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import type { AssistActionTextEditorDefinition } from "../runtime/action-editing";

export function AssistActionTextEditor({
  definition,
  value,
  open,
  disabled,
  onChange,
  onOpenChange,
  onReset,
}: {
  definition: AssistActionTextEditorDefinition;
  value: string;
  open: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
}) {
  const isDirty = value !== definition.value;
  const validationMessage = definition.validate(value);
  const textareaRef = useRef<ProTextareaElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    // The first edit gesture means "I may replace this suggestion." Focus the
    // exact payload and select all of it so typing replaces the document. The
    // delayed scroll runs after iOS has resized the visual viewport for the
    // software keyboard and keeps the field reachable in the drawer's single
    // scroll area.
    const focusFrame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
    });
    const scrollTimer = window.setTimeout(() => {
      textareaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);

    return () => {
      cancelAnimationFrame(focusFrame);
      window.clearTimeout(scrollTimer);
    };
  }, [open]);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onOpenChange(true)}
        className="mb-2 min-h-11 w-full justify-start gap-1.5 px-2 text-xs md:h-8 md:min-h-0"
      >
        <PencilLine className="h-3.5 w-3.5" />
        {definition.triggerLabel}
        {isDirty && (
          <span className="ml-auto text-[11px] font-normal text-primary">
            Edited
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
      <div className="mb-1.5 flex items-start gap-2">
        <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">
            {definition.label}
          </div>
          {definition.description && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {definition.description}
            </p>
          )}
        </div>
        {isDirty && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onReset}
            className="min-h-10 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground md:h-7 md:min-h-0"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>
      <ProTextarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={definition.maxLength}
        autoGrow
        minHeight={112}
        maxHeight={240}
        disabled={disabled}
        enableVoice={false}
        enableCleanup={false}
        enableHelpWithThis={false}
        enableCustomAgent={false}
        enableBoundAgents={false}
        showCopyButton
        className="text-base md:text-xs"
        aria-invalid={validationMessage ? true : undefined}
      />
      <div className="mt-1 flex min-h-10 items-center justify-end gap-2 md:min-h-0">
        {validationMessage ? (
          <p className="flex-1 text-[11px] text-destructive" role="alert">
            {validationMessage}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || Boolean(validationMessage)}
          onClick={() => onOpenChange(false)}
          className="min-h-10 px-2 text-xs md:h-7 md:min-h-0"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
