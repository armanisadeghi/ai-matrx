// lib/errors/toastWriteFailure.ts — put a failed write on screen in words (GATES-TAIL).
// See `writeFailure.ts` for the rule. The developer line stays in the console.
import { toast } from "@/lib/toast";
import { describeWriteFailure, WriteRefusedError } from "./writeFailure";

export function toastWriteFailure(
  err: unknown,
  words: { action: string; remedy?: string },
): void {
  const { title, description } = describeWriteFailure(err, words);
  if (err instanceof WriteRefusedError) console.warn(`[write refused] ${err.technical}`);
  toast.error(title, { description });
}
