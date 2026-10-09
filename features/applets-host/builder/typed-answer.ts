// What she typed while the builder's question is open IS the answer (lane F18).
// The result bodies are the ones the ask's own card sends: `questions` as the wizard's
// "Write message instead" / typed "Other", `choose_one` as value + note.
import type { ActionRequestRender } from "@ai-matrx/chat/action-requests/render-types";

type AnswerBody = Record<string, unknown>;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The result a sentence makes for the open ask, or null when the kind needs its card (a sign-in, a form). */
export function typedAnswerBody(render: ActionRequestRender, text: string): AnswerBody | null {
  const said = text.trim();
  if (!said) return null;
  if (render.form === "choose_one") {
    const choice = render.choices.find((c) => same(c.label, said) || same(c.value, said));
    return choice ? { value: choice.value } : { value: said, note: said };
  }
  if (render.form === "questions") {
    const first = render.questions[0];
    const option = first?.options?.find((o) => same(o.label, said));
    const picked = Boolean(option) && (first.type === "choice" || first.type === "choice_many");
    const entry = (i: number) => ({
      answer: i === 0 && first?.type === "text" ? said : null,
      selected: i === 0 && picked && option ? [option.label] : null,
      confirmed: null,
      action: null,
      freeform: i === 0 && !picked && first?.type !== "text" ? said : null,
      cancelled: false,
    });
    return {
      answers: render.questions.map((_, i) => entry(i)),
      cancelled: false,
      wrote_instead: !picked && first?.type !== "text",
      additional_instructions: null,
    };
  }
  return null;
}
