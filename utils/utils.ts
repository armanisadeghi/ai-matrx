import { redirect } from "next/navigation";

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: "error" | "success",
  path: string,
  message: string,
) {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
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

  if (options.includes(value)) {
    return value;
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
