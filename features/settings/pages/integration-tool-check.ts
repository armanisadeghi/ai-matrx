import { failureLine } from "@/lib/failure/transport";

/** Redux thunks reject with serialized objects, not necessarily Error instances. */
export function toolCheckFailure(error: unknown): string {
  const message = failureLine(error, {
    action: "checking available tools",
    fallback: "The service did not return a usable answer. Try again.",
    retrySafe: true,
  });

  // A backend may return a structured detail that is serialized into the
  // thunk's message. Neither JSON nor JS object coercion belongs in the UI.
  if (/^\s*(?:\[object Object\]|[\[{])/.test(message)) {
    return "The service did not return a usable answer. Try again.";
  }
  return message;
}
