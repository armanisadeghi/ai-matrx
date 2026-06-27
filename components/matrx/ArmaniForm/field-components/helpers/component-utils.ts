// helpers.ts

import { isValid, parse } from "date-fns";
import { clsx } from "clsx";
import { MatrxVariant } from "../types";
import { cva, type VariantProps } from "class-variance-authority";

export function getValidVariant(
  variant: MatrxVariant | undefined,
  validVariants: MatrxVariant[] = [
    "ghost",
    "link",
    "secondary",
    "outline",
    "default",
    "destructive",
    "primary",
  ],
  defaultVariant: MatrxVariant = "default",
): MatrxVariant {
  return variant && validVariants.includes(variant) ? variant : defaultVariant;
}

const baseStyles = {
  layout: "inline-flex items-center justify-center gap-2 whitespace-nowrap",
  appearance: "rounded-md text-sm font-medium transition-colors",
  focus:
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  disabled: "disabled:pointer-events-none disabled:opacity-50",
  icons: "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
};

export const createMatrixVariants = (componentSpecific = "") => {
  return cva(
    [
      baseStyles.layout,
      baseStyles.appearance,
      baseStyles.focus,
      baseStyles.disabled,
      baseStyles.icons,
      componentSpecific,
    ].join(" "),
    {
      variants: {
        variant: {
          default:
            "bg-primary text-primary-foreground shadow hover:bg-primary/90",
          primary:
            "bg-primary text-primary-foreground shadow hover:bg-primary/90",
          destructive:
            "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
          outline:
            "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
          secondary:
            "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
          ghost: "hover:bg-accent hover:text-accent-foreground",
          link: "text-primary underline-offset-4 hover:underline",
        },
        size: {
          default: "h-9 px-4 py-2",
          sm: "h-8 rounded-md px-3 text-xs",
          lg: "h-10 rounded-md px-8",
          icon: "h-9 w-9",
          m: "h-9 px-4 py-2",
          l: "h-10 px-6 py-2",
          xl: "h-12 px-8 py-3 text-base",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    },
  );
};

export type MatrixVariantProps = VariantProps<
  ReturnType<typeof createMatrixVariants>
>;

// Parses date safely
export const parseDate = (val: any): Date | undefined => {
  if (!val) return undefined;
  if (val instanceof Date) return isValid(val) ? val : undefined;
  try {
    const parsed = parse(String(val), "yyyy-MM-dd HH:mm:ss", new Date());
    return isValid(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

// Maps size strings to CSS class names
export const sizeClass = (size: string): string => {
  switch (size) {
    case "sm":
      return "text-sm";
    case "lg":
      return "text-lg";
    case "xl":
      return "text-xl";
    default:
      return "text-base";
  }
};

// Parses presets JSON string into an array
export const parsePresetOptions = (
  presetsStr: string,
  defaultPresets: any[],
): any[] => {
  try {
    if (presetsStr === "default") return defaultPresets;
    const parsed = JSON.parse(presetsStr);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => ({
        label: String(p.label),
        value: Number(p.value),
      }));
    }
    return defaultPresets;
  } catch {
    return defaultPresets;
  }
};

// Generates CSS class names
export const generateClass = (props: any): string => {
  return clsx(
    props.className !== "default" ? props.className : "",
    sizeClass(props.textSize),
    props.fullWidth !== "default" && props.fullWidth === "true" ? "w-full" : "",
  );
};

// Base styles shared across all form components
const formBaseStyles =
  "rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

// Shared size variants
const sizeVariants = {
  sm: "h-8 text-xs px-3",
  default: "h-9 text-sm px-4",
  lg: "h-10 text-base px-6",
  xl: "h-12 text-lg px-8",
};

// Shared state variants
const stateVariants = {
  default: "border-input bg-background",
  error: "border-destructive bg-destructive/10",
  success: "border-green-500 bg-green-50",
  warning: "border-yellow-500 bg-yellow-50",
};

// Example implementation for text inputs
export const inputVariants = cva(
  [
    formBaseStyles,
    "border transition-colors",
    "placeholder:text-muted-foreground",
  ].join(" "),
  {
    variants: {
      size: sizeVariants,
      state: stateVariants,
      // Input-specific variants
      type: {
        default: "bg-background",
        filled: "bg-muted",
        flushed: "rounded-none border-x-0 border-t-0 px-0",
      },
    },
    defaultVariants: {
      size: "default",
      state: "default",
      type: "default",
    },
  },
);

// Example implementation for select
export const selectVariants = cva(
  [
    formBaseStyles,
    "border transition-colors",
    "cursor-pointer",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      size: sizeVariants,
      state: stateVariants,
      // Select-specific variants
      menuPlacement: {
        top: "[&_.select__menu]:bottom-full",
        bottom: "[&_.select__menu]:top-full",
      },
    },
    defaultVariants: {
      size: "default",
      state: "default",
      menuPlacement: "bottom",
    },
  },
);
