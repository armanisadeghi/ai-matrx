import {
  splitContentIntoBlocksV2,
  detectJsonBlockType,
  normalizeCodeLanguage,
  SPECIAL_CODE_LANGUAGES,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

function isPromotableFence(
  language: string | undefined,
  code: string,
): boolean {
  const normalized = normalizeCodeLanguage(language);
  if (!normalized) return false;
  if (SPECIAL_CODE_LANGUAGES.includes(normalized)) return true;
  if (normalized === "json") return detectJsonBlockType(code) !== null;
  return false;
}

const taskCode = `## Operation: Befriend a Crow

- [ ] **Scout your spot:** Find a quiet spot.
- [ ] **Establish a routine:**
    - [ ] Show up at the same time each day`;

console.log("tasks promotable:", isPromotableFence("tasks", taskCode));
const b1 = splitContentIntoBlocksV2("```tasks\n" + taskCode + "\n```");
console.log(
  "tasks blocks:",
  b1.map((b) => b.type),
);

const quizCode = `{"quiz_title":"X","multiple_choice":[{"id":1,"question":"q","options":["a","b"],"correctAnswer":0,"explanation":"e"}]}`;
console.log("json quiz promotable:", isPromotableFence("json", quizCode));

console.log("generic json promotable:", isPromotableFence("json", '{"foo":1}'));
console.log("plain ts promotable:", isPromotableFence("ts", "const x = 1;"));
