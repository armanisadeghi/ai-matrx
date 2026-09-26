/**
 * verify-RC-B5 r4 N1 — text going to an agent carries its protected spans as
 * atoms the model cannot alter; the approved result gets them back verbatim.
 *
 * Live: Clean up on an answer with terminal output was ALWAYS refused — the
 * model returned each `\u001b` escape as a space, so the result no longer
 * matched the protected bytes, even for a one-word typo fix.
 */
import { spliceDisplayEdit, displayOfStoredAnswer } from "@/features/agents/redux/execution-system/message-crud/answer-text-splice";
import { maskProtectedSpans, unmaskProtectedSpans } from "./protectedSpans";

const ESC = "\u001b";
const STORED =
  `Run the health check on each pilot register and confirm it recieves a green status:\n\n` +
  `${ESC}[32m✔ payment daemon healthy${ESC}[0m for {{store_id}}\n` +
  `${ESC}[31m✘ printer offline${ESC}[0m — call the helpdesk.`;

/** What a model does to text it is asked to clean up: fix the typo, turn every control byte into a space. */
function model(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace("recieves", "receives").replace(/[\u0000-\u001f\u007f]/g, (c) => (c === "\n" ? c : " "));
}

test("without the markers, the result is refused — terminal codes are never overwritten with spaces", () => {
  const shown = displayOfStoredAnswer(STORED);
  const result = spliceDisplayEdit(STORED, shown, model(shown));
  expect("error" in result).toBe(true);
});

test("with the markers, the typo fix applies and every escape and variable comes back byte-for-byte", () => {
  const shown = displayOfStoredAnswer(STORED);
  const masked = maskProtectedSpans(shown);
  expect(masked.text).not.toContain(ESC);
  expect(masked.text).not.toContain("{{store_id}}");
  const restored = unmaskProtectedSpans(model(masked.text), masked.spans);
  if ("error" in restored) throw new Error(restored.error);
  const saved = spliceDisplayEdit(STORED, shown, restored.text);
  expect(saved).toEqual({
    text: STORED.replace("recieves", "receives"),
    changedSpans: 1,
    mostlyRewritten: false,
  });
});

test("a result that dropped a protected span is refused, never guessed", () => {
  const masked = maskProtectedSpans(displayOfStoredAnswer(STORED));
  const dropped = masked.text.replace("⟦P1⟧", "");
  expect("error" in unmaskProtectedSpans(dropped, masked.spans)).toBe(true);
  const duplicated = `${masked.text} ⟦P2⟧`;
  expect("error" in unmaskProtectedSpans(duplicated, masked.spans)).toBe(true);
});

test("text with nothing protected goes as it is", () => {
  expect(maskProtectedSpans("Plain words only.")).toEqual({ text: "Plain words only.", spans: [] });
});
