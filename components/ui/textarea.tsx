"use client";

/**
 * HOST RESIDUE ONLY. The plain Textarea family (Textarea, BasicTextarea,
 * TextareaWithPrefix) lives in @ai-matrx/design-system — import it from there
 * or from the re-exports below.
 *
 * The two clipboard textareas were deliberately NOT absorbed (C8 split-out
 * law), for exactly the reason the Input family's CopyInput/FancyInput/
 * DeleteInput were not: they carry a `motion/react` dependency and clipboard
 * behavior that plain-textarea consumers must not pay for. They compose the
 * package's textareas and stay host-owned until sanctioned separately.
 *
 * NOTE A REAL VISUAL CHANGE, deliberate: `shadow-textarea` now renders. The
 * class was on every one of these fields and NO host ever defined the token or
 * generated the utility, so the elevation the code asked for was never drawn.
 * The package ships `--shadow-textarea` (defaulting to the Input family's
 * elevation); set it to `none` to go back to flat.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  BasicTextarea,
  Textarea,
  type TextareaProps,
} from "@ai-matrx/design-system";
import { Check, Copy } from "lucide-react";

export {
  BasicTextarea,
  Textarea,
  TextareaWithPrefix,
} from "@ai-matrx/design-system";
export type {
  TextareaProps,
  TextareaWithPrefixProps,
} from "@ai-matrx/design-system";

function useCopy(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  props: TextareaProps,
) {
  const [hasCopied, setHasCopied] = React.useState(false);

  const handleCopy = async () => {
    const value =
      ref.current?.value || String(props.value || props.defaultValue || "");
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 450);
  };

  return { hasCopied, handleCopy };
}

function CopyButton({
  hasCopied,
  onCopy,
}: {
  hasCopied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="absolute right-2 top-2 z-10 rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Copy to clipboard"
    >
      {hasCopied ? (
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.8 }}
          className="text-success"
        >
          <Check className="h-4 w-4" />
        </motion.div>
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
      )}
    </button>
  );
}

/** The plain control plus a copy affordance. */
const CopyTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, forwarded) => {
    const internal = React.useRef<HTMLTextAreaElement | null>(null);
    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internal.current = node;
        if (typeof forwarded === "function") forwarded(node);
        else if (forwarded) forwarded.current = node;
      },
      [forwarded],
    );
    const { hasCopied, handleCopy } = useCopy(internal, props);

    return (
      <div className="relative">
        <BasicTextarea
          ref={setRef}
          className={cn("resize-y pr-10", className)}
          {...props}
        />
        <CopyButton hasCopied={hasCopied} onCopy={handleCopy} />
      </div>
    );
  },
);
CopyTextarea.displayName = "CopyTextarea";

interface FancyTextareaProps extends Omit<TextareaProps, "prefix"> {
  prefix?: React.ReactNode;
}

/** The elevated textarea plus a leading adornment and a copy affordance. */
const FancyTextarea = React.forwardRef<HTMLTextAreaElement, FancyTextareaProps>(
  ({ prefix, className, wrapperClassName, ...props }, forwarded) => {
    const internal = React.useRef<HTMLTextAreaElement | null>(null);
    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internal.current = node;
        if (typeof forwarded === "function") forwarded(node);
        else if (forwarded) forwarded.current = node;
      },
      [forwarded],
    );
    const { hasCopied, handleCopy } = useCopy(internal, props);

    return (
      <div className={cn("relative", wrapperClassName)}>
        {prefix ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 text-muted-foreground">
            {prefix}
          </div>
        ) : null}
        <Textarea
          ref={setRef}
          className={cn(prefix && "pl-10", "pr-10", className)}
          {...props}
        />
        <CopyButton hasCopied={hasCopied} onCopy={handleCopy} />
      </div>
    );
  },
);
FancyTextarea.displayName = "FancyTextarea";

export { CopyTextarea, FancyTextarea };
