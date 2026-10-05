// components/mardown-display/blocks/questionnaire/questionnaire-draft-store.ts
//
// The person's questionnaire form state, kept on this device per (conversation,
// answer, block) so a reload puts every answer back — the same moment the
// `answers` chip the Submit staged comes back. The artifact-state channel
// (canvas_item_state) only exists once the questionnaire has materialized; this
// is the path that never depends on it. Pure over a Storage, so it is testable.

const PREFIX = "matrx:questionnaire-form:v1";

export type FormStateRecord = Record<string, unknown>;

export function questionnaireDraftKey(
  conversationId: string | undefined,
  messageId: string | undefined,
  blockIndex: number | undefined,
): string | null {
  if (!conversationId || !messageId) return null;
  return `${PREFIX}:${conversationId}:${messageId}:${blockIndex ?? 0}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readQuestionnaireDraft(key: string | null, store: Storage | null = storage()): FormStateRecord | null {
  if (!key || !store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as FormStateRecord) : null;
  } catch {
    return null;
  }
}

export function writeQuestionnaireDraft(
  key: string | null,
  formState: FormStateRecord,
  store: Storage | null = storage(),
): void {
  if (!key || !store) return;
  try {
    store.setItem(key, JSON.stringify(formState));
  } catch {
    // Quota or private mode: the form still works, it just won't survive a reload.
  }
}
