/**
 * The editor callback is a persistence boundary. Do not let an accidentally
 * synchronous callback look successful merely because an async wrapper
 * implicitly turns its return value into a resolved Promise.
 */
export type SettledContentSave = (newContent: string) => Promise<void>;

function isThenable(value: unknown): value is PromiseLike<void> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function"
  );
}

export function requireSettledContentSave(
  onSave: SettledContentSave,
  newContent: string,
): Promise<void> {
  const result: unknown = onSave(newContent);
  if (!isThenable(result)) {
    throw new Error("Content editor onSave must return a Promise");
  }
  return Promise.resolve(result);
}
