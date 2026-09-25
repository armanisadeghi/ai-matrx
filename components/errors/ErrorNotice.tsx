"use client";

/**
 * ErrorNotice — THE inline error card. Every error a surface renders inline
 * ("Not saved", "Failed to load…", a dialog's refusal, a form's failure) is
 * this component, so every one of them carries the Alchemy Menu and hands an
 * AI the sentence, the code, the operation, the records, the surface's declared
 * values and the person's unsaved input.
 *
 *   <ErrorNotice
 *     title="Not saved"
 *     message={item.error}
 *     operation="Save comment"
 *     records={[{ type: "document", id: docId }]}
 *     unsavedInput={{ comment: draft }}
 *     actions={<Button onClick={retry}>Retry</Button>}
 *   />
 *
 * Guard: `components/errors/__tests__/error-renders-carry-alchemy.test.ts`
 * fails when a new file renders its own `role="alert"` error instead.
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  describeError,
  type ErrorAlchemyInput,
  type ErrorAlchemyRecord,
} from "@/components/errors/error-alchemy";
import { cn } from "@/lib/utils";

export type ErrorNoticeProps = {
  /** Short heading ("Not saved"). */
  title?: string;
  /** The sentence shown. Falls back to the error's own message. */
  message?: string;
  /** The raw error — code/status/stack go to the AI payload, never the screen. */
  error?: unknown;
  operation?: string;
  records?: readonly ErrorAlchemyRecord[];
  unsavedInput?: unknown;
  details?: Record<string, unknown>;
  code?: string | number;
  status?: number;
  /** Retry / Discard / other controls, rendered under the sentence. */
  actions?: ReactNode;
  /** Extra content under the sentence. */
  children?: ReactNode;
  /** `compact` = the dense card used inside lists and side panels. */
  size?: "compact" | "default";
  icon?: boolean;
  className?: string;
};

export function ErrorNotice({
  title,
  message,
  error,
  operation,
  records,
  unsavedInput,
  details,
  code,
  status,
  actions,
  children,
  size = "default",
  icon = true,
  className,
}: ErrorNoticeProps) {
  const sentence =
    message?.trim() ||
    describeError(error).message ||
    "Something went wrong.";
  const input: ErrorAlchemyInput = {
    title,
    message: sentence,
    error,
    operation,
    records,
    unsavedInput,
    details,
    code,
    status,
    source: "inline",
  };
  const compact = size === "compact";
  return (
    <div
      role="alert"
      data-error-notice=""
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/5",
        compact ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {icon && (
          <AlertTriangle
            aria-hidden
            className={cn(
              "shrink-0 text-destructive",
              compact ? "mt-px h-3.5 w-3.5" : "mt-0.5 h-4 w-4",
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          {title && (
            <p data-error-title="" className="font-medium text-destructive">
              {title}
            </p>
          )}
          <p className={cn("break-words text-foreground", title && "mt-0.5")}>
            {sentence}
          </p>
          {children}
          {actions && <div className="mt-1 flex flex-wrap gap-1">{actions}</div>}
        </div>
        <ErrorAlchemyMenu input={input} size={compact ? "xs" : "icon"} />
      </div>
    </div>
  );
}
