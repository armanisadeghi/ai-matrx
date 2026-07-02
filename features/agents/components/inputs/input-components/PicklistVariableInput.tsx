"use client";

import React from "react";
import { SelectInput } from "./SelectInput";
import { RadioGroupInput } from "./RadioGroupInput";
import { CheckboxGroupInput } from "./CheckboxGroupInput";
import { PillToggleInput } from "./PillToggleInput";
import { Skeleton } from "@/components/ui/skeleton";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import {
  buildPicklistItemFence,
  readPicklistSelection,
} from "@/features/matrx-envelope/referenceFence";
import { usePicklistForSelection } from "@/features/user-lists/hooks/usePicklistForSelection";

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

/**
 * Adapter that renders a picklist-bound variable using the existing choice components in
 * LABEL space, converting selections to/from the canonical ```matrx reference fence
 * (`type:"picklist_item"`, FLAT items `{ list_id, item_id, label? }`). The secret
 * description is never fetched or shown here — only labels. The persisted value is a fence
 * STRING (single = one item; multi = N items plus any "Other" free-text lines after the
 * closing fence); the server resolves the fence to each item's hidden description on the
 * wire. There is no `slot` on the item — the variable name this value is bound to IS the
 * slot. Legacy values are loud-translated on read via {@link readPicklistSelection}.
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
  const binding = customComponent.picklist;
  if (!binding) {
    // Caller (VariableInputComponent) only renders this when
    // customComponent.picklist.listId is set — this guards the invariant
    // honestly rather than asserting it.
    return (
      <p className="text-xs text-muted-foreground italic">
        This variable is not bound to a picklist.
      </p>
    );
  }
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

  // ── Outbound: inner label string -> matrx fence / free-text plain string ───────
  const emitSingle = (inner: string) => {
    if (inner.startsWith(OTHER_PREFIX)) {
      onChange(inner.slice(OTHER_PREFIX.length)); // free text stays a plain string
      return;
    }
    const item = itemByLabel.get(inner);
    onChange(
      item
        ? buildPicklistItemFence({
            listId,
            selections: [{ itemId: item.id, label: item.label }],
          })
        : "",
    );
  };

  const emitMulti = (inner: string) => {
    const parts = inner ? inner.split("\n").filter(Boolean) : [];
    const selections: Array<{ itemId: string; label: string }> = [];
    const others: string[] = [];
    for (const part of parts) {
      if (part.startsWith(OTHER_PREFIX)) {
        const text = part.slice(OTHER_PREFIX.length);
        if (text) others.push(text);
      } else {
        const item = itemByLabel.get(part);
        if (item) selections.push({ itemId: item.id, label: item.label });
      }
    }
    if (selections.length === 0 && others.length === 0) {
      onChange("");
      return;
    }
    // One fence carries every picklist item; "Other" free text trails as plain lines
    // (the server joins resolved items with "\n"; free text passes through verbatim).
    const fence = selections.length
      ? buildPicklistItemFence({ listId, selections })
      : "";
    onChange([fence, others.join("\n")].filter(Boolean).join("\n"));
  };

  // ── Inbound: stored value (fence or legacy) -> inner label string ──────────────
  const selection = readPicklistSelection(value);
  const innerValue = multiple
    ? [
        ...selection.refs.map((r) => r.label),
        ...selection.otherText.map((t) => `${OTHER_PREFIX}${t}`),
      ]
        .filter(Boolean)
        .join("\n")
    : (selection.refs[0]?.label ??
      (selection.otherText[0]
        ? `${OTHER_PREFIX}${selection.otherText[0]}`
        : ""));

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
