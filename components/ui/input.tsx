"use client";

/**
 * HOST RESIDUE ONLY. The plain Input family (Input, EnterInput, BasicInput,
 * InputWithPrefix) lives in @ai-matrx/design-system — import it from there.
 *
 * The three inputs below were deliberately NOT absorbed by the package
 * (C8 split-out law): they carry a `motion/react` dependency and clipboard
 * behavior that plain-Input consumers must not pay for. They compose the
 * package's Input and stay host-owned until sanctioned separately.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Input, type InputProps } from "@ai-matrx/design-system";
import { Check, Copy, Trash2 } from "lucide-react";

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

export { CopyInput, FancyInput, DeleteInput };
