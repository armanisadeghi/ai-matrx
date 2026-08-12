import { redirect } from "next/navigation";
import {
  preserveAuthDestination,
  type AuthDestinationSource,
} from "@/utils/auth/auth-destination";

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 *
 * 🚨 **Always pass `destinationSource` on an auth surface.** This helper used to
 * rebuild the URL as `${path}?${type}=…` and nothing else — which silently threw
 * away the user's `redirectTo` on EVERY validation error. One typo'd password,
 * one mismatched confirm field, and the page they were trying to reach was gone
 * for the rest of the flow. Pass the `FormData` (or search params) the action
 * received and the destination rides through untouched.
 *
 * @param type - The type of message, either 'error' or 'success'.
 * @param path - The path to redirect to.
 * @param message - The message to be encoded and added as a query parameter.
 * @param destinationSource - Anything carrying the auth destination (the
 *   action's `FormData`, a `URLSearchParams`, a raw URL). Omit ONLY for
 *   redirects that are not part of an auth flow.
 * @returns This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: "error" | "success",
  path: string,
  message: string,
  destinationSource?: AuthDestinationSource,
) {
  const target = preserveAuthDestination(path, destinationSource, {
    [type]: message,
  });
  return redirect(target);
}

export const truncateText = (text: string, maxLength: number = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
};

export function noErrors<T>(
  value: unknown,
  defaultValue: T,
  options: readonly T[],
  transform: ((value: unknown) => T | null) | null = null,
): T {
  if (transform) {
    const transformed = transform(value);
    if (transformed !== null && options.includes(transformed)) {
      return transformed;
    }
  }

  if (options.some((option): option is T => Object.is(option, value))) {
    return value as T;
  }

  if (typeof defaultValue === "string" && typeof value === "string") {
    const normalizedValue = value.toLowerCase();
    const match = options.find(
      (v) => typeof v === "string" && v.toLowerCase() === normalizedValue,
    );
    if (match) return match;
  }

  return defaultValue;
}

/*
// Simple usage stays simple:
const validVariant = noErrors("anything", 'rounded', ['rounded', 'geometric']);

// Complex usage when needed:
const validSize = noErrors("anything", 'md', ['sm', 'md', 'lg'],
    v => typeof v === 'number' ? ['sm', 'md', 'lg'][v] : null
);*/
