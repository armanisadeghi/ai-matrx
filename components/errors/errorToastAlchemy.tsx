"use client";

/**
 * The error-toast half of "every error on screen carries the Alchemy Menu".
 * Registered once by the app-wide Toaster (`components/ui/sonner.tsx`) through
 * `setErrorToastDecorator` in `lib/toast.ts`, so every `toast.error`,
 * `toastErrorAlreadyCaptured` and `recordToast.error` inherits it with no
 * caller change.
 */
import { createElement } from "react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { ErrorAlchemyInput } from "@/components/errors/error-alchemy";
import type { ErrorToastDecorator } from "@/lib/toast";

function descriptionText(description: unknown): string | undefined {
  return typeof description === "string" && description.trim() !== ""
    ? description
    : undefined;
}

export const decorateErrorToast: ErrorToastDecorator = (message, options, record) => {
  const description = descriptionText(options?.description);
  const input: ErrorAlchemyInput = {
    title: description ? message : undefined,
    message: description ?? message,
    records: record
      ? [{ type: record.type, id: record.id, ...(record.title ? { label: record.title } : {}) }]
      : undefined,
    source: "toast",
  };
  const menu = createElement(ErrorAlchemyMenu, { input, label: message });
  if (options?.action === undefined) return { ...options, action: menu };
  if (options?.cancel === undefined) return { ...options, cancel: menu };
  return options;
};
