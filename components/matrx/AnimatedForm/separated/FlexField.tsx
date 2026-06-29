// FlexField.tsx
import React from "react";
import { motion } from "motion/react";
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
  onUpdateField: (name: string, value: any) => void;
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

  const commonProps = {
    field: field as any,
    value: (formState[field.name] || "") as any,
    onChange: (value: any) => onUpdateField(field.name, value),
    className: styles.input,
  };

  const renderField = () => {
    switch (field.type) {
      case "text":
      case "email":
      case "number":
      case "password":
      case "tel":
      case "url":
        // @ts-ignore - size prop type mismatch, removing from commonProps
        return <AnimatedInput {...commonProps} />;

      case "textarea":
        return <AnimatedTextarea {...commonProps} />;

      case "select":
        return <AnimatedSelect {...commonProps} />;

      case "checkbox":
        return (
          <AnimatedCheckbox
            field={field as any}
            checked={(formState[field.name] || false) as boolean}
            onChange={(checked) => onUpdateField(field.name, checked)}
          />
        );

      case "radio":
        return <AnimatedRadioGroup {...commonProps} layout="vertical" />;

      case "slider":
        return (
          <Slider
            min={field.min}
            max={field.max}
            step={field.step}
            value={[(formState[field.name] ?? field.min) as number]}
            onValueChange={(value) => onUpdateField(field.name, value[0])}
            className={cn("mt-2", styles.fieldSpacing)}
          />
        );

      case "switch":
        return (
          <Switch
            checked={(formState[field.name] || false) as boolean}
            onCheckedChange={(checked) => onUpdateField(field.name, checked)}
          />
        );

      case "date":
        return (
          <DatePicker
            value={formState[field.name] as Date | undefined}
            onChange={(date) => onUpdateField(field.name, date)}
            placeholder={field.placeholder || "Select a date"}
            formatString={"MM/dd/yyyy"}
            className={styles.input}
          />
        );

      case "time":
        return (
          <TimePicker
            value={formState[field.name] as string | undefined}
            onChange={(time) => onUpdateField(field.name, time)}
            className={styles.input}
          />
        );

      case "color":
        return (
          <ColorPicker
            color={formState[field.name] as any}
            onChange={(color) => onUpdateField(field.name, color)}
          />
        );

      case "json":
        return (
          <FullEditableJsonViewer
            title={field.label}
            data={formState[field.name] as object | string}
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
            src={(field.src || formState[field.name]) as string}
            alt={field.alt || field.label}
            className={styles.input}
          />
        );

      case "rating":
        return (
          <StarRating
            rating={(formState[field.name] || 0) as number}
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
