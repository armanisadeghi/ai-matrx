"use client";

import React from "react";
import { readStructuredList } from "@/features/agents/utils/variable-customcomponent";
import { ToggleInput } from "./ToggleInput";
import { RadioGroupInput } from "./RadioGroupInput";
import { CheckboxGroupInput } from "./CheckboxGroupInput";
import { SelectInput } from "./SelectInput";
import { NumberInput } from "./NumberInput";
import { TextareaInput } from "./TextareaInput";
import { PillToggleInput } from "./PillToggleInput";
import { SliderInput } from "./SliderInput";
import { ImageVariableInput } from "./ImageVariableInput";
import { AudioVariableInput } from "./AudioVariableInput";
import { VideoVariableInput } from "./VideoVariableInput";
import { DocumentVariableInput } from "./DocumentVariableInput";
import { YoutubeVariableInput } from "./YoutubeVariableInput";
import { PicklistVariableInput } from "./PicklistVariableInput";
import {
  ScalarVariableInput,
  type ScalarInputKind,
} from "./ScalarVariableInput";
import { CurrencyVariableInput } from "./CurrencyVariableInput";
import {
  isMediaVariableType,
  type VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import { formatText } from "@ai-matrx/kit/text-case";
import { Label } from "@/components/ui/label";
import { useContainerWidth } from "./useContainerColumns";
import { Button } from "@/components/ui/button";
import { Dices } from "lucide-react";
import { IMAGE_ROLE_META } from "@ai-matrx/agents";
import { choiceControlFor } from "@/features/agents/utils/choice-rule";
import {
  isAutoAssignValue,
  RANDOM_AUTO_ASSIGN_VALUE,
  supportsRandomAssignment,
} from "@/features/agents/utils/auto-assignment";

interface VariableInputComponentProps {
  /**
   * Value can be a string for text-style inputs or a structured MediaRef
   * (or anything that coerces to one) for media-typed variables.
   */
  value: unknown;
  /**
   * onChange emits a string for text-style inputs and a MediaRef-shaped
   * object (or null when cleared) for media-typed inputs. Callers persist
   * whatever they receive.
   */
  onChange: (value: unknown) => void;
  variableName: string;
  conversationId?: string;
  customComponent?: VariableCustomComponent;
  onRequestClose?: () => void;
  helpText?: string;
  compact?: boolean;
  autoFocus?: boolean;
  hideLabel?: boolean;
  wizardMode?: boolean;
  /**
   * Field-navigation: for text/textarea inputs, plain Enter advances to the
   * next field instead of inserting a newline. Only wired to the textarea
   * input — other input types (selects, toggles, media) ignore it.
   */
  onEnterAdvance?: () => void;
  /**
   * The field's declared placeholder, when it has one. Until cold walk 22 a
   * served input's `placeholder` was parsed and then dropped here, so "The
   * text (verbatim)" on a Masterwork said "Type your answer" — it is the text
   * to be checked, not an answer.
   */
  placeholder?: string;
}

/** Coerce any incoming value to a string for the existing text-style inputs. */
function toStringValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function VariableInputComponent({
  value,
  onChange,
  variableName,
  conversationId,
  customComponent,
  onRequestClose,
  helpText,
  compact = false,
  autoFocus = true,
  hideLabel = false,
  wizardMode = false,
  onEnterAdvance,
  placeholder,
}: VariableInputComponentProps) {
  const [containerRef, containerWidth] = useContainerWidth();

  const type = customComponent?.type ?? "textarea";
  // An image variable that fills a reference-image role is asked for BY that
  // role ("Style reference") — the person uploading needs to know what the
  // image will control, not the author's variable name.
  const imageRoleMeta =
    (type === "image" || type === "video" || type === "audio") &&
    customComponent?.imageRole
      ? IMAGE_ROLE_META[customComponent.imageRole]
      : null;
  const formattedName = imageRoleMeta?.ask ?? formatText(variableName);
  const shownHelpText = helpText ?? imageRoleMeta?.explanation;
  const options = customComponent?.options ?? [];
  const hasOptions = options.length > 0;
  const sharedProps = { compact, wizardMode, containerWidth };
  const randomAssignmentEnabled = supportsRandomAssignment(customComponent);
  const isRandomAssignment = isAutoAssignValue(value);
  const effectiveValue = isRandomAssignment ? "" : value;

  // Text-style inputs (everything except the media types) have a string
  // contract. Media types receive the raw `value` so they can read MediaRef
  // fields directly.
  const stringValue = toStringValue(effectiveValue);
  const stringOnChange = (v: string) => onChange(v);

  const fallbackTextarea = (
    <TextareaInput
      value={stringValue}
      onChange={stringOnChange}
      variableName={formattedName}
      onRequestClose={onRequestClose}
      onEnterAdvance={onEnterAdvance}
      autoFocus={autoFocus}
      placeholder={placeholder}
      {...sharedProps}
    />
  );

  let inputComponent: React.ReactNode;

  // Picklist-bound: options come from the bound list (labels only) and the value is a
  // ```matrx reference fence string (`type:"picklist_item"`), not text. Orthogonal to
  // `type` — the adapter renders the chosen choice component in label space. This single
  // branch covers Inline / Stacked / Cards / Wizard (all route through VariableInputComponent).
  if (customComponent && readStructuredList(customComponent)?.listId) {
    inputComponent = (
      <PicklistVariableInput
        value={effectiveValue}
        onChange={onChange}
        variableName={formattedName}
        customComponent={customComponent}
        {...sharedProps}
      />
    );
  } else if (isMediaVariableType(type)) {
    switch (type) {
      case "image":
        inputComponent = (
          <ImageVariableInput
            value={effectiveValue}
            onChange={onChange}
            variableKey={variableName}
            variableName={formattedName}
            compact={compact}
            resourceContext={customComponent?.resource_context}
            conversationId={conversationId}
          />
        );
        break;
      case "audio":
        inputComponent = (
          <AudioVariableInput
            value={effectiveValue}
            onChange={onChange}
            variableKey={variableName}
            variableName={formattedName}
            compact={compact}
            resourceContext={customComponent?.resource_context}
            conversationId={conversationId}
          />
        );
        break;
      case "video":
        inputComponent = (
          <VideoVariableInput
            value={effectiveValue}
            onChange={onChange}
            variableKey={variableName}
            variableName={formattedName}
            compact={compact}
            resourceContext={customComponent?.resource_context}
            conversationId={conversationId}
          />
        );
        break;
      case "document":
        inputComponent = (
          <DocumentVariableInput
            value={effectiveValue}
            onChange={onChange}
            variableKey={variableName}
            variableName={formattedName}
            compact={compact}
            resourceContext={customComponent?.resource_context}
            conversationId={conversationId}
          />
        );
        break;
      case "youtube":
        inputComponent = (
          <YoutubeVariableInput
            value={effectiveValue}
            onChange={onChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;
    }
  } else {
    switch (type) {
      case "toggle":
      case "light-switch": {
        const [offLabel = "No", onLabel = "Yes"] =
          customComponent?.toggleValues || [];
        inputComponent = (
          <ToggleInput
            value={stringValue}
            onChange={stringOnChange}
            offLabel={offLabel}
            onLabel={onLabel}
            variableName={formattedName}
            threeDMode={type === "light-switch"}
            {...sharedProps}
          />
        );
        break;
      }

      case "radio":
        inputComponent = hasOptions ? (
          <RadioGroupInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            allowOther={customComponent?.allowOther}
            {...sharedProps}
          />
        ) : (
          fallbackTextarea
        );
        break;

      case "pill-toggle":
        // THE CHOICE RULE (utils/choice-rule.ts): pills only for ≤ 4 short
        // options. A longer stored pill list (older derivations stored 23
        // aspect ratios as pills) draws as the select it should have been.
        inputComponent = !hasOptions ? (
          fallbackTextarea
        ) : choiceControlFor(options) !== "pill-toggle" ? (
          <SelectInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            {...sharedProps}
          />
        ) : (
          <PillToggleInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            {...sharedProps}
          />
        );
        break;

      case "selection-list":
        inputComponent = hasOptions ? (
          <SelectInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            allowOther={customComponent?.allowOther}
            expanded
            wrap={false}
            {...sharedProps}
          />
        ) : (
          fallbackTextarea
        );
        break;

      case "buttons":
        inputComponent = hasOptions ? (
          <SelectInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            allowOther={customComponent?.allowOther}
            expanded
            wrap={true}
            {...sharedProps}
          />
        ) : (
          fallbackTextarea
        );
        break;

      case "checkbox":
        inputComponent = hasOptions ? (
          <CheckboxGroupInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            allowOther={customComponent?.allowOther}
            {...sharedProps}
          />
        ) : (
          fallbackTextarea
        );
        break;

      case "select":
        inputComponent = hasOptions ? (
          <SelectInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            allowOther={customComponent?.allowOther}
            {...sharedProps}
          />
        ) : (
          fallbackTextarea
        );
        break;

      case "number":
        inputComponent = (
          <NumberInput
            value={stringValue}
            onChange={stringOnChange}
            min={customComponent?.min}
            max={customComponent?.max}
            step={customComponent?.step}
            unit={customComponent?.unit}
            variableName={formattedName}
            {...sharedProps}
          />
        );
        break;

      case "slider":
        inputComponent = (
          <SliderInput
            value={stringValue}
            onChange={stringOnChange}
            min={customComponent?.min}
            max={customComponent?.max}
            step={customComponent?.step}
            unit={customComponent?.unit}
            variableName={formattedName}
            {...sharedProps}
          />
        );
        break;

      case "datetime":
      case "time":
      case "email":
      case "url":
      case "phone":
      case "percent":
      case "color":
      case "markdown":
        inputComponent = (
          <ScalarVariableInput
            kind={type as ScalarInputKind}
            value={stringValue}
            onChange={stringOnChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;

      case "currency":
        inputComponent = (
          <CurrencyVariableInput
            value={effectiveValue}
            onChange={onChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;

      case "textarea":
      default:
        inputComponent = fallbackTextarea;
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      className={compact ? "min-w-0 space-y-0.5" : "min-w-0 space-y-1.5"}
    >
      {!hideLabel && !compact && (
        <div>
          <Label className="text-sm font-medium">{formattedName}</Label>
          {shownHelpText && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {shownHelpText}
            </p>
          )}
        </div>
      )}

      {!hideLabel && compact && (
        <div className="flex items-center gap-1.5">
          <Label className="text-xs font-medium pb-1">{formattedName}</Label>
          {shownHelpText && (
            <span className="text-[11px] text-muted-foreground">
              · {shownHelpText}
            </span>
          )}
        </div>
      )}

      {inputComponent}
      {randomAssignmentEnabled && (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant={isRandomAssignment ? "secondary" : "outline"}
            size="sm"
            className={compact ? "h-7 text-xs" : undefined}
            onClick={() => onChange(RANDOM_AUTO_ASSIGN_VALUE)}
            aria-pressed={isRandomAssignment}
          >
            <Dices className="h-3.5 w-3.5" />
            {isRandomAssignment ? "Random on run" : "Assign randomly"}
          </Button>
        </div>
      )}
    </div>
  );
}
