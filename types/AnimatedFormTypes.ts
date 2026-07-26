export type FormFieldType =
  | "text"
  | "email"
  | "number"
  | "select"
  | "textarea"
  | "checkbox"
  | "radio"
  | "password"
  | "date"
  | "time"
  | "datetime-local"
  | "month"
  | "week"
  | "tel"
  | "url"
  | "color"
  | "slider"
  | "switch"
  | "json"
  | "file"
  | "image";

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export interface FormState {
  [key: string]: any;
}

export type AnimatedModalFormState = FormState;

export interface AnimatedFormProps {
  fields: FormField[];
  formState: FormState;
  onUpdateField: (name: string, value: any) => void;
  onSubmit: () => void;
  currentStep?: number;
  onNextStep?: () => void;
  onPrevStep?: () => void;
  isSinglePage?: boolean;
}

export type ModalOnSubmit = (() => void) | ((formData: FormState) => void);

export interface AnimatedFormModalProps extends Omit<
  Partial<AnimatedFormProps>,
  "onSubmit"
> {
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit?: ModalOnSubmit;
  triggerButton?: React.ReactNode;
}

export interface TabButton {
  label: string;
  onClick: () => void;
  className?: string;
}

export interface TabData {
  value: string;
  label: string;
  fields: FormField[];
  buttons?: TabButton[];
}

export interface AnimatedTabModalProps extends Partial<
  Omit<AnimatedFormProps, "onSubmit">
> {
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit?: ModalOnSubmit;
  triggerButton?: React.ReactNode;
  title?: string;
  description?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  footer?: React.ReactNode;
  tabs?: TabData[];
  children?: React.ReactNode;
}
