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
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { OpenOneMenuButton } from "@/features/rich-document/variants/shared/OpenOneMenuButton";
import type { ContentSource } from "@/features/rich-document/types";

export type ErrorNoticeProps = {
  /** Short heading ("Not saved"). */
  title?: string;
  /** The sentence shown. Falls back to the error's own message. */
  message?: string | null;
  /** The raw error — code/status/stack go to the AI payload, never the screen. */
  error?: unknown;
  operation?: string;
  records?: readonly ErrorAlchemyRecord[];
  unsavedInput?: unknown;
  details?: Record<string, unknown>;
  code?: string | number;
  status?: number;
  /** The tables / RPCs the failed call used — pins its captured request as the cause. */
  calls?: readonly string[];
  /** Retry / Discard / other controls, rendered under the sentence. */
  actions?: ReactNode;
  /** Extra content under the sentence. */
  children?: ReactNode;
  /**
   * `default` = the card. `compact` = the dense card used inside lists and
   * side panels. `inline` = a one-line field/form error (no card chrome): the
   * sentence in the destructive colour with the menu at its end — the shape
   * every `<p role="alert" className="text-destructive">` render moves onto.
   */
  size?: "inline" | "compact" | "default";
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
  calls,
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
    ...(calls ? { calls } : {}),
    source: "inline",
  };
  if (size === "inline") {
    return (
      <div
        role="alert"
        data-error-notice=""
        className={cn("flex items-start gap-1 text-destructive", className)}
      >
        <span className="min-w-0 flex-1 break-words">
          {title ? (
            <span data-error-title="" className="font-medium">
              {title}:{" "}
            </span>
          ) : null}
          {sentence}
        </span>
        {children}
        {actions}
        <ErrorAlchemyMenu input={input} size="xs" />
      </div>
    );
  }
  const compact = size === "compact";
  // Title, actions or extra content make the card taller than the ⋯ + menu column.
  const stacked = Boolean(title || actions || children);
  // The card is an action host like any other content (ALC-15): right-click,
  // ⋯ (the same menu, opened at the button), the phone's sheet and the palette
  // (⌘/Ctrl+Shift+K) all show the ONE registry's actions over this sentence.
  // Read-only: nothing here may change a record.
  const source: ContentSource = { type: "raw", title: title ?? "Error", readOnly: true };
  const card = (
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
            {!stacked && <ErrorAlchemyMenu input={input} size="xs" />}
          </p>
          {children}
          {actions && <div className="mt-1 flex flex-wrap gap-1">{actions}</div>}
        </div>
        {/* The corner column the ⋯ already owns carries the menu under it: no
            new column (beside the ⋯ it narrowed every line — 176→224px at
            375px) and no new line (inline, a full last line wrapped it,
            +16px). A one-line notice with nothing under its sentence is
            shorter than that column, so there the menu rides the sentence
            (RC-B12 layout rule). */}
        <div className="flex shrink-0 flex-col items-center">
          <OpenOneMenuButton source={source} className={compact ? "h-6 w-6" : undefined} />
          {stacked && <ErrorAlchemyMenu input={input} size="xs" />}
        </div>
      </div>
    </div>
  );
  return (
    <NonEditableContextMenu
      sourceFeature="system"
      contentSource={source}
      contextData={{ content: title ? `${title}: ${sentence}` : sentence }}
    >
      {card}
    </NonEditableContextMenu>
  );
}
