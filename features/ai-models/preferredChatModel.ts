// features/ai-models/preferredChatModel.ts
//
// `agents.model_prefs.chat_default_model` — "the model that answers when you
// have not picked one: chat, quick questions, everyday drafting" — resolved
// through THE settings ladder (organization → user → device, nearest wins;
// `lib/scoped-config/sessionKnob.ts`).
//
// A null/"" answer means "the platform's primary text model": the run then
// carries NO model override and the Holder's own model answers, which for
// the basic chat door is the catalog's `is_primary` text model
// (`features/ai-models/redux/platformDefaultModel.ts` names it for display).
//
// WHERE IT IS HONOURED: the launch orchestrator seeds the instance's model
// override with this answer for the basic-chat door
// (`chat.default_new_chat`) when the caller passed no explicit model — so the
// picker on the chat surface shows it as the current model, and the turn's
// request body carries it as `config_overrides.model`. A person picking a
// different model in the chat picker for one conversation still wins there.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";

export const CHAT_DEFAULT_MODEL_KNOB = "agents.model_prefs.chat_default_model";

/** The mandate doors whose "no model picked" answer is this preference. */
const BASIC_WORK_MANDATE_KEYS: ReadonlySet<string> = new Set([
  MANDATE_KEYS.chat__default_new_chat,
]);

export function isBasicWorkMandate(mandateKey: string | undefined): boolean {
  return Boolean(mandateKey && BASIC_WORK_MANDATE_KEYS.has(mandateKey));
}

/**
 * The person's preferred model id for basic work, or null when they (and
 * their organization) left it to the platform. A read failure is announced
 * and answers null — a run never blocks on a preference.
 */
export async function resolvePreferredChatModel(): Promise<string | null> {
  try {
    const value = await resolveSessionKnob(CHAT_DEFAULT_MODEL_KNOB);
    return typeof value === "string" && value.trim() !== "" ? value : null;
  } catch (error) {
    console.error(
      `[preferredChatModel] ${CHAT_DEFAULT_MODEL_KNOB} could not be resolved — the Holder's own model answers this run:`,
      error,
    );
    return null;
  }
}
