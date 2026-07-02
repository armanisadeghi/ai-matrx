// FlexField.tsx
import React from "react";
import { motion } from "motion/react";
import { Colord } from "colord";
import { cn } from "@/utils/cn";
import AnimatedInput from "../AnimatedInput";
import AnimatedTextarea from "../AnimatedTextarea";
import AnimatedSelect from "../AnimatedSelect";
import AnimatedCheckbox from "../AnimatedCheckbox";
import AnimatedRadioGroup from "../AnimatedRadioGroup";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { FullEditableJsonViewer } from "@/components/ui/JsonComponents";
import { FileUpload } from "@/components/ui/file-upload/file-upload";
import ColorPicker from "@/components/ui/color-picker";
import ImageDisplay from "@/components/ui/image-display";
import StarRating from "@/components/ui/star-rating";
import { FlexFormField, FormState } from "@/types/componentConfigTypes";
import type { FormField, FormFieldType } from "@/types/AnimatedFormTypes";

export type FlexDensity = "compact" | "normal" | "comfortable";

const densityConfig: Record<
  FlexDensity,
  {
    wrapper: string;
    label: string;
    input: string;
    fieldSpacing: string;
    controlSize: "sm" | "md" | "lg";
  }
> = {
  compact: {
    wrapper: "space-y-1",
    label: "text-sm font-medium mb-0.5",
    input: "p-1 text-sm",
    fieldSpacing: "mb-2",
    controlSize: "sm",
  },
  normal: {
    wrapper: "space-y-2",
    label: "text-sm font-medium mb-1",
    input: "p-2",
    fieldSpacing: "mb-3",
    controlSize: "md",
  },
  comfortable: {
    wrapper: "space-y-3",
    label: "text-base font-medium mb-2",
    input: "p-3",
    fieldSpacing: "mb-4",
    controlSize: "lg",
  },
};

interface FlexFieldProps {
  field: FlexFormField;
  formState: FormState;
  onUpdateField: (name: string, value: unknown) => void;
  density?: FlexDensity;
}

export const FlexField: React.FC<FlexFieldProps> = ({
  field,
  formState,
  onUpdateField,
  density = "normal",
}) => {
  const styles = densityConfig[density];

  const FieldWrapper: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <div className={cn(styles.wrapper, styles.fieldSpacing)}>
      {field.label && (
        <label htmlFor={field.name} className={styles.label}>
          {field.label}
        </label>
      )}
      {children}
    </div>
  );

  const rawValue = formState[field.name];
  const stringValue = typeof rawValue === "string" ? rawValue : "";

  // Adapts the locally-typed FlexFormField (loose `type: string`) into the strict
  // FormField shape the Animated* leaf components require, for a `type` already
  // narrowed to a known FormFieldType literal by the switch below.
  const toFormField = (type: FormFieldType): FormField => ({
    name: field.name,
    label: field.label,
    type,
    options: field.options?.filter((o): o is string => typeof o === "string"),
    placeholder: field.placeholder,
    required: field.required,
    disabled: field.disabled,
  });

  const renderField = () => {
    switch (field.type) {
      case "text":
      case "email":
      case "number":
      case "password":
      case "tel":
      case "url":
        return (
          <AnimatedInput
            field={toFormField(field.type)}
            value={stringValue}
            onChange={(value) => onUpdateField(field.name, value)}
            className={styles.input}
          />
        );

      case "textarea":
        return (
          <AnimatedTextarea
            field={toFormField(field.type)}
            value={stringValue}
            onChange={(value) => onUpdateField(field.name, value)}
            className={styles.input}
          />
        );

      case "select":
        return (
          <AnimatedSelect
            field={toFormField(field.type)}
            value={stringValue}
            onChange={(value) => onUpdateField(field.name, value)}
            className={styles.input}
          />
        );

      case "checkbox":
        return (
          <AnimatedCheckbox
            field={toFormField(field.type)}
            checked={typeof rawValue === "boolean" ? rawValue : false}
            onChange={(checked) => onUpdateField(field.name, checked)}
          />
        );

      case "radio":
        return (
          <AnimatedRadioGroup
            field={toFormField(field.type)}
            value={stringValue}
            onChange={(value) => onUpdateField(field.name, value)}
            className={styles.input}
            layout="vertical"
          />
        );

      case "slider": {
        const sliderValue = typeof rawValue === "number" ? rawValue : field.min;
        return (
          <Slider
            min={field.min}
            max={field.max}
            step={field.step}
            value={[sliderValue ?? 0]}
            onValueChange={(value) => onUpdateField(field.name, value[0])}
            className={cn("mt-2", styles.fieldSpacing)}
          />
        );
      }

      case "switch":
        return (
          <Switch
            checked={typeof rawValue === "boolean" ? rawValue : false}
            onCheckedChange={(checked) => onUpdateField(field.name, checked)}
          />
        );

      case "date":
        return (
          <DatePicker
            value={rawValue instanceof Date ? rawValue : undefined}
            onChange={(date) => onUpdateField(field.name, date)}
            placeholder={field.placeholder || "Select a date"}
            formatString={"MM/dd/yyyy"}
            className={styles.input}
          />
        );

      case "time":
        return (
          <TimePicker
            value={typeof rawValue === "string" ? rawValue : undefined}
            onChange={(time) => onUpdateField(field.name, time)}
            className={styles.input}
          />
        );

      case "color":
        return (
          <ColorPicker
            color={rawValue instanceof Colord ? rawValue : undefined}
            onChange={(color) => onUpdateField(field.name, color)}
          />
        );

      case "json":
        return (
          <FullEditableJsonViewer
            title={field.label}
            data={
              typeof rawValue === "string" || (typeof rawValue === "object" && rawValue !== null)
                ? rawValue
                : null
            }
            onChange={(json) => onUpdateField(field.name, json)}
            initialExpanded={true}
            maxHeight={
              density === "compact"
                ? "300px"
                : density === "comfortable"
                  ? "700px"
                  : "500px"
            }
            validateDelay={300}
            lockKeys={false}
            defaultEnhancedMode={true}
            className={styles.input}
          />
        );

      case "file":
        return (
          <FileUpload onChange={(files) => onUpdateField(field.name, files)} />
        );

      case "image":
        return (
          <ImageDisplay
            src={field.src || stringValue}
            alt={field.alt || field.label}
            className={styles.input}
          />
        );

      case "rating":
        return (
          <StarRating
            rating={typeof rawValue === "number" ? rawValue : 0}
            onChange={(rating) => onUpdateField(field.name, rating)}
            color={"amber"}
            size={styles.controlSize}
            disabled={field.disabled || false}
            viewOnly={false}
          />
        );

      default:
        return null;
    }
  };

  return <FieldWrapper>{renderField()}</FieldWrapper>;
};
