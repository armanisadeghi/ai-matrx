/**
 * Generate the SHARED nested-fence conformance vectors from the TypeScript
 * implementation (the rule: components/markdown-core/fence-nesting.ts; the
 * static splitter: content-splitter-core.ts).
 *
 * Writes three byte-identical twins:
 *   matrx-frontend components/markdown-core/__tests__/fence-nesting-vectors.json
 *   aidream apps/shared/content-ir-core/__tests__/fence-nesting-vectors.json
 *   aidream packages/matrx-ai/tests/fixtures/fence_nesting_vectors.json
 * Consumers: the frontend test (fence-nesting-vectors.test.ts) and matrx-ai's
 * test_fence_nesting_vectors.py (which also asserts the two aidream twins are
 * identical). Spec: common-docs/systems/content-ir-system/NESTED-FENCES.md.
 *
 *   npx tsx scripts/generate-fence-nesting-vectors.ts
 *
 * Regenerate ONLY from the TS implementation, never by hand; a changed
 * expectation is a behavior change that both languages must adopt together.
 */
import { writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { classifyInnerFenceLine } from "@/components/markdown-core/fence-nesting";
import {
  NO_SPLITTER_ENVELOPES,
  splitContentIntoBlocksWith,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-core";

const F = "```";

const README_DOC = [
  "# Pickup Scheduler",
  "",
  "| Route | Day | Driver |",
  "|---|---|---|",
  "| North Industrial | Tuesday | D. Alvarez |",
  "| Harbor Commercial | Thursday | K. Osei |",
  "",
  "## Setup",
  "",
  `${F}bash`,
  "pnpm install",
  "pnpm db:seed --routes north,harbor",
  F,
  "",
  "Run `pnpm dev` and open the route board.",
].join("\n");

/** Documents: realistic assistant answers, each a different fence shape. */
const DOCUMENTS: { name: string; input: string }[] = [
  {
    name: "markdown fence carrying a bash block (the live bug)",
    input: `Here is the README for the pickup scheduler:\n\n${F}markdown\n${README_DOC}\n${F}\n\nWant me to add the driver onboarding section too?`,
  },
  {
    name: "md alias with two inner blocks",
    input: `Draft:\n\n${F}md\n# Intake\n\n${F}python\nprint("check in")\n${F}\n\n${F}sql\nselect 1;\n${F}\n${F}\n\nDone.`,
  },
  {
    name: "longer outer fence already nests under CommonMark",
    input: `Draft:\n\n\`\`\`\`md\n${README_DOC}\n\`\`\`\`\n\nDone.`,
  },
  {
    name: "bash fence keeps strict CommonMark",
    input: `Script:\n\n${F}bash\ncat <<EOF\n${F}python\nprint("hi")\n${F}\nEOF\n${F}\n\nEnd.`,
  },
  {
    name: "unclosed nested fence falls back to strict at end of text",
    input: `${F}markdown\n# Doc\n\n${F}bash\npnpm install\n\n${F}python\nprint(1)\n${F}\n\nAfter.`,
  },
  {
    name: "mdx fence with a jsx block",
    input: `Page:\n\n${F}mdx\n# Welcome\n\n${F}jsx\n<Banner />\n${F}\n${F}\n\nShip it.`,
  },
  {
    name: "plain python fence then prose",
    input: `Run this:\n\n${F}python\nx = 1\n${F}\n\nThen check the log.`,
  },
];

/** Classifier cases: one trimmed line inside an open fence. */
const LINES: [string, number, boolean, number][] = [
  [`${F}bash`, 3, true, 0],
  [F, 3, true, 1],
  [F, 3, true, 0],
  [`${F}bash`, 3, false, 0],
  [F, 3, false, 0],
  [F, 4, true, 0],
  [`${F}python`, 4, true, 0],
  ["````", 3, true, 1],
  ["``", 3, true, 0],
  ["plain text", 3, true, 1],
  [`${F} js`, 3, true, 2],
  [`${F}a\`b`, 3, true, 0],
];

const vectors = {
  _comment:
    "Shared nested-fence conformance vectors — generated from the TypeScript implementation by matrx-frontend scripts/generate-fence-nesting-vectors.ts. Three byte-identical twins (matrx-frontend components/markdown-core/__tests__/fence-nesting-vectors.json, aidream apps/shared/content-ir-core/__tests__/fence-nesting-vectors.json, aidream packages/matrx-ai/tests/fixtures/fence_nesting_vectors.json). `blocks` lists every non-blank block's type, language and trimmed content. Regenerate ONLY from the TS implementation, never by hand.",
  classify: LINES.map(([line, openTicks, nests, depth]) => ({
    line,
    openTicks,
    nests,
    depth,
    expected: classifyInnerFenceLine(line, openTicks, nests, depth),
  })),
  documents: DOCUMENTS.map(({ name, input }) => ({
    name,
    input,
    blocks: splitContentIntoBlocksWith(input, NO_SPLITTER_ENVELOPES)
      .filter((b) => b.content.trim())
      .map((b) => ({
        type: b.type,
        language: b.language ?? null,
        content: b.content.trim(),
      })),
  })),
};

const json = `${JSON.stringify(vectors, null, 2)}\n`;
const frontend = resolve(__dirname, "..");
const aidream = resolve(frontend, "..", "aidream");
const targets = [
  join(frontend, "components/markdown-core/__tests__/fence-nesting-vectors.json"),
  join(aidream, "apps/shared/content-ir-core/__tests__/fence-nesting-vectors.json"),
  join(aidream, "packages/matrx-ai/tests/fixtures/fence_nesting_vectors.json"),
];
for (const target of targets) {
  if (!existsSync(resolve(target, ".."))) {
    throw new Error(`Twin directory missing: ${target} — is the aidream checkout beside matrx-frontend?`);
  }
  writeFileSync(target, json);
  console.log(`wrote ${target}`);
}
