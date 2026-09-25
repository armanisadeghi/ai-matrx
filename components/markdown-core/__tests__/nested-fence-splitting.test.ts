/**
 * FORCING FUNCTION: a ```markdown fence that carries its own ```bash block
 * stays ONE markdown block — statically and while streaming.
 *
 * The break this catches: strict-CommonMark closing, where the first inner
 * bare ``` ends the markdown card mid-document, the rest of the document
 * leaks out as prose and the outer closing ``` opens a phantom code block
 * that swallows the assistant's closing sentence. Fails on the pre-fix
 * splitters (content-splitter-v2 + StreamBlockAccumulator).
 *
 * Use case: a recycling company's operations lead asks the assistant for a
 * README for their pickup-scheduling repository; the answer is a ```markdown
 * document containing a route table and a ```bash setup block.
 */
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { classifyInnerFenceLine } from "@ai-matrx/content-ir/source";

const F = "```";

const README_DOC = `# Pickup Scheduler

| Route | Day | Driver |
|---|---|---|
| North Industrial | Tuesday | D. Alvarez |
| Harbor Commercial | Thursday | K. Osei |

## Setup

${F}bash
pnpm install
pnpm db:seed --routes north,harbor
${F}

Run \`pnpm dev\` and open the route board.`;

const MESSAGE = `Here is the README for the pickup scheduler:

${F}markdown
${README_DOC}
${F}

Want me to add the driver onboarding section too?`;

// A second input with a DIFFERENT expected shape: a longer ````markdown fence
// already nested correctly before the fix and must keep doing so.
const LONG_FENCE_MESSAGE = `Draft:

\`\`\`\`md
${README_DOC}
\`\`\`\`

Done.`;

function streamed(source: string, chunk: number) {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("readme", (payload) => {
    latest.set(payload.block.blockId, payload.block);
    return payload;
  });
  const dispatch = (action: unknown) => action;
  for (let i = 0; i < source.length; i += chunk)
    accumulator.ingest(source.slice(i, i + chunk), dispatch);
  accumulator.finalize(dispatch);
  return [...latest.values()]
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .filter((b) => (b.content ?? "").trim())
    .map((b) => ({
      type: b.type,
      language:
        (b.data as { language?: string } | null | undefined)?.language ?? null,
      content: (b.content ?? "").trim(),
    }));
}

describe("markdown fences keep their inner fences", () => {
  it.each([
    ["```markdown with inner ```bash", MESSAGE, "markdown"],
    ["````md with inner ```bash", LONG_FENCE_MESSAGE, "md"],
  ])("%s splits into prose + ONE markdown block + prose (static)", (_n, source, lang) => {
    const blocks = splitContentIntoBlocksV2(source)
      .filter((b) => b.content.trim())
      .map((b) => ({
        type: b.type,
        language: (b as { language?: string }).language ?? null,
        content: b.content.trim(),
      }));
    const code = blocks.filter((b) => b.type === "code");
    expect(code).toHaveLength(1);
    expect(code[0]).toEqual({
      type: "code",
      language: lang,
      content: README_DOC,
    });
    // Nothing of the document leaked out as prose.
    const prose = blocks.filter((b) => b.type !== "code").map((b) => b.content);
    expect(prose.join("\n")).not.toContain("Run `pnpm dev`");
  });

  it.each([1, 3, 7, 13, 64])(
    "the live accumulator produces the same markdown block at chunk size %i",
    (chunk) => {
      const blocks = streamed(MESSAGE, chunk);
      const code = blocks.filter((b) => b.type === "code");
      expect(code).toEqual([
        { type: "code", language: "markdown", content: README_DOC },
      ]);
      expect(blocks[blocks.length - 1]?.content).toBe(
        "Want me to add the driver onboarding section too?",
      );
    },
  );

  it("a ```bash fence (not markdown) keeps strict CommonMark closing", () => {
    // Inside a bash fence, ```python is content and the first bare ``` closes.
    expect(classifyInnerFenceLine("```python", 3, false, 0)).toBe("content");
    expect(classifyInnerFenceLine("```", 3, false, 0)).toBe("close-outer");
    // Inside a markdown fence the same lines nest.
    expect(classifyInnerFenceLine("```python", 3, true, 0)).toBe("open-nested");
    expect(classifyInnerFenceLine("```", 3, true, 1)).toBe("close-nested");
    expect(classifyInnerFenceLine("```", 3, true, 0)).toBe("close-outer");
  });
});
