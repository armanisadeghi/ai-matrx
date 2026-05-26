// types.ts - Core types for AI Assistant components

// Base interaction with common properties
export interface BaseInteraction {
  id: number;
  type: InteractionType;
  timestamp: number;
  isAnswered?: boolean;
}

// Union type for all interaction types
export type InteractionType = 'text' | 'question' | 'input' | 'slider' | 'checkbox';

// Text message interaction
export interface TextInteraction extends BaseInteraction {
  type: 'text';
  content: string;
}

// Question with options interaction
export interface QuestionInteraction extends BaseInteraction {
  type: 'question';
  content: string;
  options: string[];
  answer?: string | null;
}

// Text input interaction
export interface InputInteraction extends BaseInteraction {
  type: 'input';
  label: string;
  value?: string;
}

// Slider interaction
export interface SliderInteraction extends BaseInteraction {
  type: 'slider';
  label: string;
  min: number;
  max: number;
  value: number;
}

// Checkbox group interaction
export interface CheckboxInteraction extends BaseInteraction {
  type: 'checkbox';
  label: string;
  options: string[];
  selected?: string[];
}

// Union type for all interaction formats
export type Interaction = 
  | TextInteraction 
  | QuestionInteraction 
  | InputInteraction
  | SliderInteraction
  | CheckboxInteraction;

// Type guards for interaction types
export const isTextInteraction = (interaction: Interaction): interaction is TextInteraction => 
  interaction.type === 'text';

export const isQuestionInteraction = (interaction: Interaction): interaction is QuestionInteraction =>
  interaction.type === 'question';

export const isInputInteraction = (interaction: Interaction): interaction is InputInteraction =>
  interaction.type === 'input';

export const isSliderInteraction = (interaction: Interaction): interaction is SliderInteraction =>
  interaction.type === 'slider';

export const isCheckboxInteraction = (interaction: Interaction): interaction is CheckboxInteraction =>
  interaction.type === 'checkbox';

// Utility type for flexible updates
export type InteractionUpdate<T extends Interaction> = Partial<T> & { id: number };

// Props for the main AIAssistant component
export interface AIAssistantProps {
  onAddToContext?: (items: Interaction[]) => void;
  onFeedbackChange?: (value: number) => void;
  className?: string;
}

// Props for the InteractionItem component
export interface InteractionItemProps {
  interaction: Interaction;
  expanded?: boolean;
  toggleExpanded: (id: number) => void;
  handleAnswer: (id: number, answer: any) => void;
  handleInputChange: (id: number, value: string) => void;
  handleSliderChange: (id: number, value: number) => void;
  handleCheckboxChange: (id: number, option: string, isChecked: boolean) => void;
  moveToHistory: (id: number) => void;
}

// Props for the HistoryItem component
export interface HistoryItemProps {
  interaction: Interaction;
  restoreFromHistory: (id: number) => void;
  toggleHistory: () => void;
}

// Props for the HoldingArea component
export interface HoldingAreaProps {
  items: Interaction[];
  onAddToContext: () => void;
  onClear: () => void;
  onRemoveItem: (id: number) => void;
}