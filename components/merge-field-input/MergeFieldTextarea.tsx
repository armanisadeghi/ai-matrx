"use client";

// components/merge-field-input/MergeFieldTextarea.tsx
//
// THE merge-field text field: ProTextarea (the one field toolbar — mic and
// dictation, the "…" menu with copy / clean up / help / custom agent, the
// page's bound agents, right-click) hosting MergeFieldInput in its `editor`
// slot, so `{{merge.fields}}` read as chips while every text-field door stays.

import { forwardRef, useImperativeHandle, useRef } from "react";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { ApplicationScope } from "@ai-matrx/chat/agents/types/scope.types";
import type { SourceFeature } from "@ai-matrx/agents/generated/source-attribution";
import { MergeFieldInput, type MergeFieldInputHandle } from "./MergeFieldInput";

export interface MergeFieldTextareaProps {
  value: string;
  onChange: (value: string) => void;
  fieldLabel: (path: string) => string;
  multiline?: boolean;
  placeholder?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  surfaceName?: string;
  sourceFeature?: SourceFeature;
  getApplicationScope?: () => ApplicationScope;
  className?: string;
  wrapperClassName?: string;
  /** Names the mic / "…" controls for screen readers when a page has several. */
  auxiliaryControlsLabel?: string;
}

export const MergeFieldTextarea = forwardRef<MergeFieldInputHandle, MergeFieldTextareaProps>(
  function MergeFieldTextarea(
    {
      value,
      onChange,
      fieldLabel,
      multiline = true,
      placeholder,
      surfaceName,
      sourceFeature,
      getApplicationScope,
      className,
      wrapperClassName,
      auxiliaryControlsLabel,
      ...aria
    },
    ref,
  ) {
    const inner = useRef<MergeFieldInputHandle | null>(null);
    useImperativeHandle(ref, () => ({
      focus: () => inner.current?.focus(),
      getValue: () => inner.current?.getValue() ?? value,
      getSelection: () =>
        inner.current?.getSelection() ?? { start: value.length, end: value.length },
      write: (next: string) => inner.current?.write(next) ?? false,
      insertField: (path: string, asExample?: boolean) =>
        inner.current?.insertField(path, asExample),
      hasSelection: () => inner.current?.hasSelection() ?? false,
      select: (start: number, end: number) => inner.current?.select(start, end),
    }));

    return (
      <ProTextarea
        value={value}
        placeholder={placeholder}
        surfaceName={surfaceName}
        sourceFeature={sourceFeature}
        getApplicationScope={getApplicationScope}
        wrapperClassName={wrapperClassName}
        className={className}
        auxiliaryControlsLabel={auxiliaryControlsLabel}
        editor={{
          handle: inner,
          singleLine: !multiline,
          render: (field) => (
            <MergeFieldInput
              ref={inner}
              {...field}
              {...aria}
              value={value}
              onChange={onChange}
              fieldLabel={fieldLabel}
              multiline={multiline}
            />
          ),
        }}
      />
    );
  },
);
