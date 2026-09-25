// lib/output-feedback/verdict.ts
//
// THE one verdict toggle — used by the React hook (useOutputFeedback) and by
// the rich-document thumbs actions, so a thumb pressed anywhere behaves the
// same: optimistic paint, clicking the ACTIVE verdict retracts it, and a
// failed write rolls the store back.

import { clearOutputFeedback, saveOutputFeedback } from "./service";
import { peekOutputFeedback, setOutputFeedbackRecord } from "./store";
import type { OutputFeedbackSubject, OutputFeedbackVerdict } from "./types";

export interface ToggleVerdictExtras {
  requestId?: string | null;
  surfaceName?: string | null;
  originalContent?: string | null;
}

/** Returns the verdict now in force (null after a retraction). */
export async function toggleOutputFeedbackVerdict(
  subject: OutputFeedbackSubject,
  verdict: OutputFeedbackVerdict,
  extras: ToggleVerdictExtras = {},
): Promise<OutputFeedbackVerdict | null> {
  const current = peekOutputFeedback(subject) ?? null;
  if (current?.verdict === verdict) {
    setOutputFeedbackRecord(subject, null);
    try {
      await clearOutputFeedback(subject);
    } catch (error) {
      setOutputFeedbackRecord(subject, current);
      throw error;
    }
    return null;
  }
  if (current) setOutputFeedbackRecord(subject, { ...current, verdict });
  try {
    const saved = await saveOutputFeedback({ ...subject, verdict, ...extras });
    setOutputFeedbackRecord(subject, saved);
  } catch (error) {
    setOutputFeedbackRecord(subject, current);
    throw error;
  }
  return verdict;
}
