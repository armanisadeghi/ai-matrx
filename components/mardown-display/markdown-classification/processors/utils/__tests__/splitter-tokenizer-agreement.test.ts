/**
 * FORCING FUNCTION: the renderer's splitters never claim a protected block
 * the source tokenizer (`@ai-matrx/content-ir/source`, the reference for
 * island boundaries) reads as prose — RC-B3r, from verify-RC-B3.md
 * § Renderer-side disagreements. Each fixture is a structural reproducer of a
 * real row (shape only; the words are this file's own use case):
 *
 *  1. `<artifact>` / `<decision>` mentioned inside inline code opened a block
 *     (skills 1eedd145…, 06aab555…, feature_docs 2d4ac350…);
 *  2. a YAML `description: >-` line read as an XML opener and turned the rest
 *     of the document into one code/xml block (feature_docs d0194777…, 17 rows);
 *  3. a back-ticked `<artifact …>` mention closed by an `</artifact>` inside a
 *     later ``` example, whose closing fence then opened a ~23 KB code block
 *     (feature_docs c900ba96…);
 *  4. a shell heredoc (`cat > file <<'EOF'`) read as XML (chat e10afee9…#3);
 *  5. a same-line `<thinking>…</thinking>` read as an orphan closer that swept
 *     ~3.6 KB of preceding prose into a thinking block (agent 015c4042…#0).
 *
 * (6) `matrx_file` storage-URL lines are a deliberate difference: the renderer
 * shows a file card, the tokenizer lets the URL be edited — both correct.
 *
 * Use case: a recycling company's operations documentation and assistant
 * answers about its pickup-route tooling.
 */
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { tokenizeSource } from "@ai-matrx/content-ir/source";

const F = "```";
const PROSE = "Dispatch reviews the North Industrial and Harbor Commercial routes every Tuesday before the crews leave.\n";

function split(text: string) {
  return splitContentIntoBlocksV2(text).filter((b) => b.content.trim());
}

function streamed(source: string, chunk = 7) {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("agreement", (payload) => {
    latest.set(payload.block.blockId, payload.block);
    return payload;
  });
  const dispatch = (action: unknown) => action;
  for (let i = 0; i < source.length; i += chunk)
    accumulator.ingest(source.slice(i, i + chunk), dispatch);
  accumulator.finalize(dispatch);
  return [...latest.values()]
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .filter((b) => (b.content ?? "").trim());
}

/**
 * Every non-prose block the splitter emits must sit inside an island the
 * tokenizer protects — ALL of it: its whole content is found within one
 * island's raw bytes. (Checking only the first 60 characters let a block that
 * starts inside an island and runs past it through — RC-B3r R1.)
 */
function disagreements(text: string): string[] {
  // Block islands, plus inline islands inside prose (a same-line
  // `<thinking>…</thinking>` is an inline island).
  const islands = tokenizeSource(text).flatMap((b) => [
    ...(b.kind === "island" ? [b.raw] : []),
    ...b.inlines.map((i) => i.raw),
  ]);
  return split(text)
    .filter((b) => !["text", "table", "matrx_file", "image", "accent-divider", "heavy-divider"].includes(b.type))
    .filter((b) => !islands.some((raw) => raw.includes(b.content.trim())))
    .map((b) => `${b.type}${(b as { language?: string }).language ? "/" + (b as { language?: string }).language : ""}`);
}

const CASES = {
  "1 · artifact mentioned in inline code":
    `${PROSE}\n9. **Never wrap the answer in \`<artifact>\`** — use \`<troubleshooting>\` for fixes.\n\n## Route board\n\n${PROSE}`,
  "1 · decision mentioned in inline code":
    `${PROSE}\n4. **Log it as:** \`Decision: <decision> — <why> — <cost of error>\`. Keep it short;\n   note who approved it.\n\n${PROSE}`,
  "1 · artifact element example in inline code":
    `- **Artifacts (one line):** the model emits \`<artifact type="plan">body</artifact>\`; the canvas opens it.\n- ${PROSE}`,
  "2 · YAML folded value in front matter":
    `---\nname: route-board-v3\ndescription: >-\n  How the pickup board works and when to\n  "open <surface> in v3" for dispatch.\n---\n\n# Route board v3\n\n${PROSE}`,
  "3 · mention then fenced example":
    `The canvas reads \`<artifact type="plan" id="…">\`, rendering one card per artifact.\n\n**Shape of the tag:**\n\n${F}\n<artifact type="<type>" id="<uuid>"> ... body ... </artifact>\n${F}\n\n${PROSE.repeat(20)}`,
  "4 · shell heredoc":
    `Save the notes:\n\ncat > "$HOME/.config/route-notes.md" <<'EOF_ID'\n# Route notes\n\nNorth Industrial runs Tuesday.\nEOF_ID\nchmod 644 "$HOME/.config/route-notes.md" || true\n\nDone.`,
  "R1 · artifact tag inside a YAML literal value in front matter":
    `---\ntitle: Kiln log\nnotes: |\n  use <artifact> sparingly\n  and <thinking> never\nsummary: >\n  folded <decision> text\n---\n\n${PROSE}`,
  "C1 · JSON object as a front-matter value":
    `---\ncard: {"__kind":"quiz","q":"x"}\n---\n\n${PROSE}`,
  "C1 · front matter behind a byte-order mark":
    `\uFEFF---\nnote: <artifact> x\n---\n\n${PROSE}`,
  "C2 · inline think span, then a stray closer later":
    "Dispatch plan for Tuesday. A <think>quick check</think> of the routes is done.\n\nMore detail follows here.\n</think>\n\nFinal answer: North Industrial first.",
  "5 · same-line thinking span after long prose":
    `${PROSE.repeat(30)}\nThe planner writes a <thinking> short scratch note about the Harbor route </thinking> and then answers.\n\n${PROSE}`,
} as const;

describe("renderer splitter agrees with the source tokenizer", () => {
  it.each(Object.entries(CASES))("%s", (_name, text) => {
    expect(disagreements(text)).toEqual([]);
  });

  it("R1 · tags inside front matter open nothing — static or live", () => {
    const text = CASES["R1 · artifact tag inside a YAML literal value in front matter"];
    expect(split(text).map((b) => b.type)).toEqual(["text"]);
    expect(streamed(text).map((b) => b.type)).toEqual(["text"]);
    expect(disagreements(text)).toEqual([]);
  });

  it.each([
    CASES["C1 · JSON object as a front-matter value"],
    CASES["C1 · front matter behind a byte-order mark"],
  ])("C1 · front matter renders as one unit — static and live (%#)", (text) => {
    expect(split(text).map((b) => b.type)).toEqual(["text"]);
    expect(streamed(text).map((b) => b.type)).toEqual(["text"]);
    expect(tokenizeSource(text)[0]?.islandType).toBe("front_matter");
  });

  it("C2 · an inline span pairs with its OWN closer; the stray closer later is an orphan (nearest-closer pairing)", () => {
    const text = CASES["C2 · inline think span, then a stray closer later"];
    const blocks = split(text);
    // The orphan closer folds the text before it (the one documented rescue,
    // as the tokenizer reads it) — and nothing is lost from that text.
    expect(blocks.map((b) => b.type)).toEqual(["thinking", "text"]);
    expect(blocks[0]?.content).toContain("of the routes is done.");
    expect(blocks[0]?.content).toContain("More detail follows here.");
    expect(blocks[1]?.content.trim()).toBe("Final answer: North Industrial first.");
    const rescue = tokenizeSource(text).find((b) => b.islandType === "xml_region");
    expect(rescue?.meta.continuation).toBe(true);
    expect(rescue?.raw).toContain("of the routes is done.");
  });

  it("5 · a thinking span inside a sentence stays inside its sentence (RC-B3r R2)", () => {
    // The tokenizer reads it as an inline island and the live accumulator
    // keeps it in its text block; cutting it out broke the sentence into
    // three blocks and the aside vanished from /chat, live and on reload.
    const text = CASES["5 · same-line thinking span after long prose"];
    expect(split(text).filter((b) => b.type === "thinking")).toEqual([]);
    const prose = split(text).filter((b) => b.type === "text").map((b) => b.content).join("\n");
    expect(prose).toContain("The planner writes a <thinking> short scratch note about the Harbor route </thinking> and then answers.");
    expect(prose.split("Dispatch reviews").length - 1).toBe(31);
    expect(streamed(text).filter((b) => b.type === "thinking")).toEqual([]);
  });

  it.each([
    CASES["1 · artifact mentioned in inline code"],
    CASES["1 · decision mentioned in inline code"],
    CASES["3 · mention then fenced example"],
  ])("1/3 · the live accumulator opens no artifact/decision from an inline-code mention (%#)", (text) => {
    const types = streamed(text).map((b) => b.type);
    expect(types).not.toContain("artifact");
    expect(types).not.toContain("decision");
  });

  it("2/4 · a real line-leading XML element still becomes an XML block", () => {
    const text = `${PROSE}\n<route_note priority="high">\nNorth Industrial runs **Tuesday**.\n</route_note>\n\n${PROSE}`;
    const xml = split(text).filter((b) => b.type === "code");
    expect(xml).toHaveLength(1);
    expect(xml[0].content).toContain("<route_note");
    expect(disagreements(text)).toEqual([]);
  });

  it("1 · a real mid-line decision element still opens a decision", () => {
    const text = `Pick one: <decision prompt="Which route first?" id="d1">\n<option id="a">North</option>\n<option id="b">Harbor</option>\n</decision>\n\nThanks.`;
    expect(split(text).map((b) => b.type)).toContain("decision");
  });
});
