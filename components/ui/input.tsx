"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { MatrxVariant } from "./types";
import { Check, Copy, Trash2 } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: MatrxVariant;
}

const getVariantStyles = (variant: MatrxVariant = "default") => {
  const baseStyles = `flex h-10 w-full border border-border bg-background text-black dark:text-white shadow-input rounded-md px-3 py-2 text-sm file:border-0 file:bg-transparent 
    file:text-sm file:font-medium placeholder:text-neutral-400 dark:placeholder-text-neutral-600 
    focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600
    disabled:cursor-not-allowed disabled:opacity-50
    dark:shadow-[0px_0px_1px_1px_var(--neutral-700)]
    transition duration-400
    [&:-webkit-autofill]:bg-background [&:-webkit-autofill]:shadow-[0_0_0_1000px_hsl(var(--background))_inset] [&:-webkit-autofill]:[caret-color:currentColor]
    dark:[&:-webkit-autofill]:shadow-[0_0_0_1000px_hsl(var(--background))_inset] dark:[&:-webkit-autofill]:[-webkit-text-fill-color:white]
    [&:-webkit-autofill:hover]:shadow-[0_0_0_1000px_hsl(var(--background))_inset] [&:-webkit-autofill:focus]:shadow-[0_0_0_1000px_hsl(var(--background))_inset]`;

  switch (variant) {
    case "destructive":
      return `${baseStyles} bg-destructive text-destructive-foreground`;
    case "outline":
      return `${baseStyles} border-2`;
    case "secondary":
      return `${baseStyles} bg-secondary text-secondary-foreground`;
    case "ghost":
      return `${baseStyles} bg-transparent shadow-none`;
    case "link":
      return `${baseStyles} bg-transparent underline-offset-4 hover:underline`;
    case "primary":
      return `${baseStyles} bg-primary text-primary-foreground`;
    default:
      return baseStyles;
  }
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(getVariantStyles(variant), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

interface EnterInputProps extends InputProps {
  onEnter?: () => void;
}

export const EnterInput = React.forwardRef<HTMLInputElement, EnterInputProps>(
  ({ onEnter, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && onEnter) {
        e.preventDefault();
        onEnter();
      }
    };

    return (
      <Input
        {...props}
        ref={ref}
        onKeyDown={(e) => {
          handleKeyDown(e);
          if (props.onKeyDown) {
            props.onKeyDown(e);
          }
        }}
      />
    );
  },
);

EnterInput.displayName = "EnterInput";

const BasicInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
BasicInput.displayName = "BasicInput";

interface InputWithPrefixProps extends Omit<InputProps, "prefix"> {
  prefix?: React.ReactNode;
  wrapperClassName?: string;
}

const InputWithPrefix = React.forwardRef<
  HTMLInputElement,
  InputWithPrefixProps
>(({ prefix, className, wrapperClassName, ...props }, ref) => {
  return (
    <div className={cn("relative", wrapperClassName)}>
      {prefix && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {prefix}
        </div>
      )}
      <Input
        ref={ref}
        className={cn(prefix && "pl-10", className)}
        {...props}
      />
    </div>
  );
});
InputWithPrefix.displayName = "InputWithPrefix";

const CopyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    const [hasCopied, setHasCopied] = React.useState(false);

    const handleCopy = async () => {
      if (props.value || props.defaultValue) {
        await navigator.clipboard.writeText(
          String(props.value || props.defaultValue),
        );
        setHasCopied(true);

        setTimeout(() => {
          setHasCopied(false);
        }, 450);
      }
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={type}
          variant={variant}
          className={cn("pr-8", className)}
          {...props}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md transition-colors"
          aria-label="Copy to clipboard"
        >
          {hasCopied ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="text-green-500"
            >
              <Check className="h-4 w-4" />
            </motion.div>
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>
    );
  },
);

CopyInput.displayName = "CopyInput";

interface FancyInputProps extends Omit<InputProps, "prefix"> {
  prefix?: React.ReactNode;
  wrapperClassName?: string;
}

const FancyInput = React.forwardRef<HTMLInputElement, FancyInputProps>(
  ({ prefix, className, wrapperClassName, ...props }, ref) => {
    const [hasCopied, setHasCopied] = React.useState(false);

    const handleCopy = async () => {
      if (props.value || props.defaultValue) {
        await navigator.clipboard.writeText(
          String(props.value || props.defaultValue),
        );
        setHasCopied(true);

        setTimeout(() => {
          setHasCopied(false);
        }, 450);
      }
    };

    return (
      <div className={cn("relative", wrapperClassName)}>
        {prefix && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {prefix}
          </div>
        )}
        <Input
          ref={ref}
          className={cn(prefix && "pl-10", "pr-8", className)}
          {...props}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md transition-colors"
          aria-label="Copy to clipboard"
        >
          {hasCopied ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="text-green-500"
            >
              <Check className="h-4 w-4" />
            </motion.div>
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>
    );
  },
);

FancyInput.displayName = "FancyInput";

interface DeleteInputProps extends InputProps {
  onDelete?: () => void;
  wrapperClassName?: string;
}

const DeleteInput = React.forwardRef<HTMLInputElement, DeleteInputProps>(
  ({ onDelete, className, wrapperClassName, ...props }, ref) => {
    const handleDelete = () => {
      if (onDelete) {
        onDelete();
      }
    };

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        <Input ref={ref} className={cn("pr-8 w-full", className)} {...props} />
        <button
          type="button"
          onClick={handleDelete}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md transition-colors hover:text-destructive"
          aria-label="Delete field"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
        </button>
      </div>
    );
  },
);

DeleteInput.displayName = "DeleteInput";

export {
  Input,
  BasicInput,
  InputWithPrefix,
  CopyInput,
  FancyInput,
  DeleteInput,
};
