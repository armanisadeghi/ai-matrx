"use client";

import React from "react";
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
import {
  isMediaVariableType,
  type VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import { formatText } from "@/utils/text/text-case-converter";
import { Label } from "@/components/ui/label";
import { useContainerWidth } from "./useContainerColumns";

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
  customComponent?: VariableCustomComponent;
  onRequestClose?: () => void;
  helpText?: string;
  compact?: boolean;
  hideLabel?: boolean;
  wizardMode?: boolean;
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
  customComponent,
  onRequestClose,
  helpText,
  compact = false,
  hideLabel = false,
  wizardMode = false,
}: VariableInputComponentProps) {
  const formattedName = formatText(variableName);
  const [containerRef, containerWidth] = useContainerWidth();

  const type = customComponent?.type ?? "textarea";
  const options = customComponent?.options ?? [];
  const hasOptions = options.length > 0;
  const sharedProps = { compact, wizardMode, containerWidth };

  // Text-style inputs (everything except the media types) have a string
  // contract. Media types receive the raw `value` so they can read MediaRef
  // fields directly.
  const stringValue = toStringValue(value);
  const stringOnChange = (v: string) => onChange(v);

  const fallbackTextarea = (
    <TextareaInput
      value={stringValue}
      onChange={stringOnChange}
      variableName={formattedName}
      onRequestClose={onRequestClose}
      {...sharedProps}
    />
  );

  let inputComponent: React.ReactNode;

  // Media types: pass the raw value through, expect MediaRef-shaped onChange.
  if (isMediaVariableType(type)) {
    switch (type) {
      case "image":
        inputComponent = (
          <ImageVariableInput
            value={value}
            onChange={onChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;
      case "audio":
        inputComponent = (
          <AudioVariableInput
            value={value}
            onChange={onChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;
      case "video":
        inputComponent = (
          <VideoVariableInput
            value={value}
            onChange={onChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;
      case "document":
        inputComponent = (
          <DocumentVariableInput
            value={value}
            onChange={onChange}
            variableName={formattedName}
            compact={compact}
          />
        );
        break;
      case "youtube":
        inputComponent = (
          <YoutubeVariableInput
            value={value}
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
        inputComponent = hasOptions ? (
          <PillToggleInput
            value={stringValue}
            onChange={stringOnChange}
            options={options}
            variableName={formattedName}
            {...sharedProps}
          />
        ) : (
          fallbackTextarea
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
            variableName={formattedName}
            {...sharedProps}
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
    <div ref={containerRef} className={compact ? "space-y-0.5" : "space-y-1.5"}>
      {!hideLabel && !compact && (
        <div>
          <Label className="text-sm font-medium">{formattedName}</Label>
          {helpText && (
            <p className="text-xs text-muted-foreground mt-0.5">{helpText}</p>
          )}
        </div>
      )}

      {!hideLabel && compact && (
        <div className="flex items-center gap-1.5">
          <Label className="text-xs font-medium pb-1">{formattedName}</Label>
          {helpText && (
            <span className="text-[11px] text-muted-foreground">
              · {helpText}
            </span>
          )}
        </div>
      )}

      {inputComponent}
    </div>
  );
}
