// types.ts - Core type definitions
import { ReactNode, ComponentType } from 'react';
import { LucideIcon } from 'lucide-react';

// Base type for all configuration options
export type OptionId = string;
export type OptionValue = string | number | boolean | string[];

// Configuration state management
export interface ConfigState {
  [key: string]: OptionValue;
}

// Card configuration
export interface CardConfig {
  id: string;
  title: string;
  icon: LucideIcon;
  size?: 'small' | 'normal' | 'medium' | 'large';
  component: ComponentType<CardComponentProps>;
}

// Props passed to each card component
export interface CardComponentProps {
  config: CardConfig;
  state: ConfigState;
  onChange: (id: OptionId, value: OptionValue) => void;
}

// Option types for different UI controls
export interface ToggleOption {
  type: 'toggle';
  id: OptionId;
  label: string;
  icon: LucideIcon;
  defaultValue?: boolean;
}

export interface SliderOption {
  type: 'slider';
  id: OptionId;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  leftLabel?: string;
  rightLabel?: string;
  defaultValue?: number;
}

export interface SelectOption {
  type: 'select';
  id: OptionId;
  label: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  defaultValue?: string;
}

export interface MultiSelectOption {
  type: 'multiSelect';
  id: OptionId;
  label: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  defaultValue?: string[];
}

export interface RadioGroupOption {
  type: 'radioGroup';
  id: OptionId;
  label: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  defaultValue?: string;
}

export interface InputOption {
  type: 'input';
  id: OptionId;
  label: string;
  placeholder?: string;
  defaultValue?: string;
}

export type OptionConfig = 
  | ToggleOption
  | SliderOption
  | SelectOption
  | MultiSelectOption
  | RadioGroupOption
  | InputOption;

// Section configuration
export interface SectionConfig {
  id: string;
  title: string;
  icon: LucideIcon;
  description?: string;
  cards: CardConfig[];
}

// Full configuration
export interface AICustomizationConfig {
  sections: SectionConfig[];
}

// Main component props
export interface AICustomizationProps {
  initialState?: Record<string, ConfigState>;
  config: AICustomizationConfig;
  onSave?: (state: Record<string, ConfigState>) => void;
}