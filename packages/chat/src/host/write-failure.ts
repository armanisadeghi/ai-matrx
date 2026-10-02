/**
 * A failed write on screen, in words, with a remedy — through the notify port.
 *
 * Same name and shape the call sites used when they imported the host app's
 * `toastWriteFailure` (P5): the words come from `describeWriteFailure`
 * (`@ai-matrx/data/db`, one implementation for every client); the developer
 * line stays in the console.
 */
import { describeWriteFailure, WriteRefusedError } from "@ai-matrx/data/db";
import { toast } from "./notify";

export function toastWriteFailure(
  err: unknown,
  words: { action: string; remedy?: string },
): void {
  const { title, description } = describeWriteFailure(err, words);
  if (err instanceof WriteRefusedError) console.warn(`[write refused] ${err.technical}`);
  else console.warn(`[write refused] ${words.action}`, err);
  toast.error(title, { description });
}
