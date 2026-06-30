/** Shared Matrx component sizing / density tokens and form prop contracts. */

import type React from "react";

export type ComponentSize =
  "default" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "icon";

export type ComponentDensity = "compact" | "normal" | "comfortable";

export type TextareaSize =
  "compact" | "default" | "large" | "article" | "custom";

export type AnimationPreset =
  "none" | "subtle" | "smooth" | "energetic" | "playful" | "feedback" | "error";

export type ComponentVariant =
  "default" | "primary" | "secondary" | "destructive" | "ghost" | "link";

export type ComponentState =
  "idle" | "loading" | "success" | "error" | "disabled";

export interface BaseMatrxProps {
  size?: ComponentSize;
  density?: ComponentDensity;
  variant?: ComponentVariant;
  state?: ComponentState;
  disabled?: boolean;
  error?: boolean | string;
  className?: string;
  animation?: AnimationPreset;
  disableAnimation?: boolean;
}

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  key?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  description?: string;
}

export interface FlexFormField {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  section?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | SelectOption[];
  multiple?: boolean;
  accept?: string;
  jsonSchema?: object;
  src?: string;
  alt?: string;
}

export type FormState = Record<string, unknown>;

export interface MatrxFieldProps extends BaseMatrxProps {
  field?: FlexFormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  hint?: string;
  hideLabel?: boolean;
}

export interface MatrxInputProps extends MatrxFieldProps {
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

export interface MatrxBaseInputProps extends BaseMatrxProps {
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export interface MatrxTextareaProps extends MatrxFieldProps {
  style?: React.CSSProperties;
  id?: string;
  busy?: boolean;
  required?: boolean;
  readOnly?: boolean;
  loading?: boolean;
  textareaSize?: TextareaSize;
  rows?: number;
  richText?: boolean;
  fullWidth?: boolean;
  animationDelay?: number;
  valid?: boolean;
  mode?: "outlined" | "filled" | "plain" | "markdown";
  contentSize?: TextareaSize;
  showCount?: boolean;
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
  characterLimit?: number;
  wordLimit?: number;
  toolbar?: boolean;
  placeholder?: string;
}

export interface MatrxSelectProps extends MatrxFieldProps {
  options?: SelectOption[];
  placeholder?: string;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  allowClear?: boolean;
  searchable?: boolean;
}

export interface MatrxButtonProps extends BaseMatrxProps {
  children?: React.ReactNode;
  busy?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  type?: "button" | "submit" | "reset";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export interface MatrxButtonGroupProps extends BaseMatrxProps {
  children?: React.ReactNode;
  orientation?: "horizontal" | "vertical";
  fullWidth?: boolean;
  attached?: boolean;
}

export interface MatrxInputGroupProps extends BaseMatrxProps {
  children?: React.ReactNode;
  label?: string;
  hint?: string;
  required?: boolean;
  orientation?: "horizontal" | "vertical";
  attached?: boolean;
}

export interface AnimatedCheckboxProps extends MatrxFieldProps {
  checked?: boolean;
  onChange?: (value: unknown) => void;
}

export interface MatrxRadioProps extends MatrxFieldProps {
  checked?: boolean;
  layout?: "vertical" | "horizontal" | "grid";
  columns?: number;
  showSelectAll?: boolean;
  optionClassName?: string;
}

export interface MatrxRadioGroupProps extends MatrxFieldProps {
  options?: SelectOption[];
  children?: React.ReactNode;
  label?: string;
  layout?: "vertical" | "horizontal" | "grid";
  columns?: number;
  showSelectAll?: boolean;
}

export interface MatrxJsonItemProps extends BaseMatrxProps {
  keyName?: string;
  value?: unknown;
  isExpanded?: boolean;
  onToggle?: (path: string) => void;
  isKeyExpanded?: (key: string) => boolean;
  path?: string;
  isLastItem?: boolean;
}

export interface MatrxJsonViewerProps extends BaseMatrxProps {
  data?: unknown;
  initialExpanded?: boolean;
  maxHeight?: string;
  hideControls?: boolean;
  onCopy?: (data: string) => void;
  onExpandChange?: (expanded: boolean) => void;
}

export interface MatrxFullJsonViewerProps extends MatrxJsonViewerProps {
  title?: string;
  hideTitle?: boolean;
  cardProps?: Record<string, unknown>;
}
