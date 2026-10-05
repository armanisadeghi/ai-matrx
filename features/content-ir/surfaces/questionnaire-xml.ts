/**
 * XML body grammar for `<questionnaire>` — what models actually write:
 *
 *   <questionnaire title="…" description="…">
 *     <question id="a" type="text" prompt="…" />
 *     <question id="b" type="choice" prompt="…">
 *       <option value="x">Label</option>
 *     </question>
 *   </questionnaire>
 *
 * Produces the SAME canonical value as the legacy text strategy
 * (`questionnaire`/`questionnaire_question`/`questionnaire_option`), so the
 * renderer, bridge and answers remark are shared. Dispatch lives in
 * `questionnaire-legacy-text.ts` (one strategy name per surface row).
 *
 * Tolerant by design: the question text may come from `prompt` / `question` /
 * `text` / `label` / `title` or the element body; option text from the body
 * else `label` / `value`; type words beyond the canonical enum
 * (`choice`, `single`, `multiple`, `scale`, `yes_no`…) map to the closest one.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";
import {
  questionTypeFromTypeString,
  type QuestionnaireQuestionType,
} from "../kinds/questionnaire";

const ATTR_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attrsOf(attrString: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrString)) !== null) out[m[1]] = m[2] ?? m[3] ?? "";
  return out;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

/** Words models use that the component's TYPE_PATTERNS do not cover. */
function typeFromWord(word: string | undefined): QuestionnaireQuestionType {
  const w = (word ?? "").trim().toLowerCase();
  if (/^(choice|single|single[_ -]?choice|single[_ -]?select|multiple[_ -]?choice[_ -]?single|radio)$/.test(w))
    return "radio";
  if (/^(multi|multiple|multi[_ -]?select|multi[_ -]?choice|many)$/.test(w)) return "checkbox";
  if (/^(yes[_ -]?no|bool|boolean)$/.test(w)) return "toggle";
  if (/^(number|rating|scale)$/.test(w)) return "slider";
  if (w === "") return "text";
  return questionTypeFromTypeString(w);
}

const QUESTION_RE = /<question\b([^>]*?)(?:\/>|>([\s\S]*?)<\/question\s*>)/gi;
const OPTION_RE = /<option\b([^>]*?)(?:\/>|>([\s\S]*?)<\/option\s*>)/gi;
const ROOT_RE = /^\s*<questionnaire\b([^>]*)>/i;

export const looksLikeQuestionnaireXml = (body: string) => /<question\b/i.test(body);

export function questionnaireXmlToKindValue(regionText: string): Record<string, unknown> | null {
  const root = regionText.match(ROOT_RE);
  const rootAttrs = root ? attrsOf(root[1]) : {};

  const questions: Record<string, unknown>[] = [];
  const re = new RegExp(QUESTION_RE.source, QUESTION_RE.flags);
  let q: RegExpExecArray | null;
  while ((q = re.exec(regionText)) !== null) {
    const attrs = attrsOf(q[1]);
    const body = q[2] ?? "";
    const text = decodeEntities(
      (
        attrs.prompt ?? attrs.question ?? attrs.text ?? attrs.label ?? attrs.title ??
        body.replace(/<option\b[\s\S]*?(?:<\/option\s*>|\/>)/gi, "").replace(/<[^>]+>/g, "")
      ).trim(),
    );
    if (!text) continue;

    const type = typeFromWord(attrs.type);
    const options: Record<string, unknown>[] = [];
    const ore = new RegExp(OPTION_RE.source, OPTION_RE.flags);
    let o: RegExpExecArray | null;
    while ((o = ore.exec(body)) !== null) {
      const oa = attrsOf(o[1]);
      const name = decodeEntities(((o[2] ?? "").trim() || oa.label || oa.value || "").trim());
      if (name) options.push({ [KIND_KEY]: "questionnaire_option", name });
    }

    const question: Record<string, unknown> = {
      [KIND_KEY]: "questionnaire_question",
      question: text,
      type,
      ...(attrs.description || attrs.hint ? { description: decodeEntities(attrs.description ?? attrs.hint) } : {}),
      ...(options.length > 0 ? { options } : {}),
    };
    if (type === "slider") {
      const min = Number.parseInt(attrs.min ?? "", 10);
      const max = Number.parseInt(attrs.max ?? "", 10);
      if (Number.isInteger(min) && Number.isInteger(max)) {
        question.min = min;
        question.max = max;
      }
    }
    questions.push(question);
  }

  if (questions.length === 0) return null;
  return {
    [KIND_KEY]: "questionnaire",
    ...(rootAttrs.title ? { title: decodeEntities(rootAttrs.title) } : {}),
    ...(rootAttrs.description ? { description: decodeEntities(rootAttrs.description) } : {}),
    questions,
  };
}
