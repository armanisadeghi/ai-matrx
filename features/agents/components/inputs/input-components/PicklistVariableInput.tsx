"use client";

import React from "react";
import { SelectInput } from "./SelectInput";
import { RadioGroupInput } from "./RadioGroupInput";
import { CheckboxGroupInput } from "./CheckboxGroupInput";
import { PillToggleInput } from "./PillToggleInput";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isPicklistRef,
  type PicklistRefEnvelope,
  type VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import { usePicklistForSelection } from "@/features/user-lists/hooks/usePicklistForSelection";
import type { PicklistSelectionItem } from "@/features/user-lists/types";

interface PicklistVariableInputProps {
  value: unknown;
  onChange: (value: unknown) => void;
  /** Already-formatted variable name (VariableInputComponent formats it). */
  variableName: string;
  customComponent: VariableCustomComponent;
  compact?: boolean;
  wizardMode?: boolean;
  containerWidth?: number;
}

const OTHER_PREFIX = "Other: ";

function envelopeFor(
  item: PicklistSelectionItem,
  listId: string,
): PicklistRefEnvelope {
  return {
    type: "picklist_ref",
    list_id: listId,
    list_item_id: item.id,
    label: item.label,
  };
}

/** A stored value entry -> the label string the inner (label-space) component expects. */
function entryToInner(entry: unknown): string {
  if (isPicklistRef(entry)) return entry.label;
  if (typeof entry === "string" && entry) return `${OTHER_PREFIX}${entry}`;
  return "";
}

/**
 * Adapter that renders a picklist-bound variable using the existing choice components in
 * LABEL space, converting selections to/from the {@link PicklistRefEnvelope} wire value.
 * The secret description is never fetched or shown here — only labels.
 */
export function PicklistVariableInput({
  value,
  onChange,
  variableName,
  customComponent,
  compact = false,
  wizardMode = false,
  containerWidth = 0,
}: PicklistVariableInputProps) {
  const binding = customComponent.picklist!;
  const listId = binding.listId;
  const multiple = !!binding.multiple;
  const allowOther = customComponent.allowOther;

  const { items, loading, unavailable } = usePicklistForSelection(
    listId,
    binding.groupName,
  );

  const options = items.map((i) => i.label);
  const itemByLabel = new Map(items.map((i) => [i.label, i]));
  const sharedProps = { compact, wizardMode, containerWidth };

  // ── Outbound: inner label string -> envelope(s) / free-text plain string ───────
  const emitSingle = (inner: string) => {
    if (inner.startsWith(OTHER_PREFIX)) {
      onChange(inner.slice(OTHER_PREFIX.length)); // free text stays a plain string
      return;
    }
    const item = itemByLabel.get(inner);
    onChange(item ? envelopeFor(item, listId) : "");
  };

  const emitMulti = (inner: string) => {
    const parts = inner ? inner.split("\n").filter(Boolean) : [];
    const out: (PicklistRefEnvelope | string)[] = [];
    for (const part of parts) {
      if (part.startsWith(OTHER_PREFIX)) {
        out.push(part.slice(OTHER_PREFIX.length));
      } else {
        const item = itemByLabel.get(part);
        if (item) out.push(envelopeFor(item, listId));
      }
    }
    onChange(out);
  };

  // ── Inbound: stored value -> inner label string ──────────────────────────────
  const innerValue = multiple
    ? (Array.isArray(value) ? value.map(entryToInner).filter(Boolean).join("\n") : "")
    : entryToInner(value);

  if (loading) {
    return <Skeleton className={compact ? "h-8 w-full" : "h-9 w-full"} />;
  }
  if (unavailable || options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {unavailable
          ? "This list is no longer available."
          : "No options in this list yet."}
      </p>
    );
  }

  if (multiple) {
    return (
      <CheckboxGroupInput
        value={innerValue}
        onChange={emitMulti}
        options={options}
        variableName={variableName}
        allowOther={allowOther}
        {...sharedProps}
      />
    );
  }

  switch (customComponent.type) {
    case "radio":
      return (
        <RadioGroupInput
          value={innerValue}
          onChange={emitSingle}
          options={options}
          variableName={variableName}
          allowOther={allowOther}
          {...sharedProps}
        />
      );
    case "pill-toggle":
      return (
        <PillToggleInput
          value={innerValue}
          onChange={emitSingle}
          options={options}
          variableName={variableName}
          {...sharedProps}
        />
      );
    case "selection-list":
      return (
        <SelectInput
          value={innerValue}
          onChange={emitSingle}
          options={options}
          variableName={variableName}
          allowOther={allowOther}
          expanded
          wrap={false}
          {...sharedProps}
        />
      );
    case "buttons":
      return (
        <SelectInput
          value={innerValue}
          onChange={emitSingle}
          options={options}
          variableName={variableName}
          allowOther={allowOther}
          expanded
          wrap
          {...sharedProps}
        />
      );
    case "select":
    default:
      return (
        <SelectInput
          value={innerValue}
          onChange={emitSingle}
          options={options}
          variableName={variableName}
          allowOther={allowOther}
          {...sharedProps}
        />
      );
  }
}
