/**
 * The fence info string reaches the code renderer — the break this guards:
 * `ts title="app.tsx" {1,3-5}` used to be cut to its first word by both the
 * static splitter and the stream accumulator, so filename titles and line
 * highlighting never rendered. Each case below has a different expected
 * outcome, so a constant parser cannot pass.
 */
import {
  FENCE_META_KEY,
  parseFenceMeta,
  parseLineRanges,
  splitFenceInfo,
} from "@/components/markdown-core/fence-meta";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

describe("splitFenceInfo", () => {
  it.each([
    ["ts", { language: "ts", meta: undefined }],
    ['ts title="app/page.tsx" {1,3-5}', { language: "ts", meta: 'title="app/page.tsx" {1,3-5}' }],
    ["python:scripts/pickup_routes.py", { language: "python", meta: 'title="scripts/pickup_routes.py"' }],
    ["sql{2,4}", { language: "sql", meta: "{2,4}" }],
    ["{1-2}", { language: undefined, meta: "{1-2}" }],
    ["", { language: undefined, meta: undefined }],
  ])("%s", (info, expected) => {
    expect(splitFenceInfo(info)).toEqual(expected);
  });
});

describe("parseFenceMeta", () => {
  it.each([
    [
      'title="routes/pickup.ts" {1,3-5}',
      { title: "routes/pickup.ts", highlightLines: [1, 3, 4, 5] },
    ],
    ["filename='invoice.sql' showLineNumbers{40}", {
      title: "invoice.sql",
      highlightLines: [],
      showLineNumbers: true,
      startLine: 40,
    }],
    ["{7}", { highlightLines: [7] }],
    ["showLineNumbers", { highlightLines: [], showLineNumbers: true }],
    [undefined, { highlightLines: [] }],
  ])("%s", (meta, expected) => {
    expect(parseFenceMeta(meta)).toEqual(expected);
  });

  it("skips malformed and reversed ranges instead of throwing", () => {
    expect(parseLineRanges("9-3, x, 0, 2, 4-4")).toEqual([2, 4]);
  });
});

const ROUTE_FILE = [
  "Here is the dispatcher update:",
  "",
  '```ts title="lib/dispatch/assignRoute.ts" {2,4-5}',
  "export function assignRoute(stop: PickupStop) {",
  "  const truck = nearestTruck(stop.zip);",
  "  if (!truck) return null;",
  "  truck.stops.push(stop);",
  "  return truck.id;",
  "}",
  "```",
  "",
  "Deploy after the 6 AM route freeze.",
].join("\n");

describe("fence meta reaches the code block", () => {
  it("static splitter carries the meta on the code block", () => {
    const blocks = splitContentIntoBlocksV2(ROUTE_FILE);
    const code = blocks.find((b) => b.type === "code");
    expect(code?.language).toBe("ts");
    expect(code?.metadata?.[FENCE_META_KEY]).toBe(
      'title="lib/dispatch/assignRoute.ts" {2,4-5}',
    );
  });

  it("stream accumulator carries the meta on the live block's data", () => {
    const latest = new Map<string, RenderBlockPayload>();
    const accumulator = new StreamBlockAccumulator(
      "fence-meta-dispatcher-route",
      (payload) => {
        latest.set(payload.block.blockId, payload.block);
        return payload;
      },
    );
    const dispatch = (action: unknown) => action;
    for (const chunk of ROUTE_FILE.match(/[\s\S]{1,17}/g) ?? []) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);
    const code = [...latest.values()].find((b) => b.type === "code");
    const data = code?.data as Record<string, unknown> | null | undefined;
    expect(data?.language).toBe("ts");
    expect(data?.[FENCE_META_KEY]).toBe(
      'title="lib/dispatch/assignRoute.ts" {2,4-5}',
    );
  });
});

describe("fence meta on a JSON fence", () => {
  it("the static splitter keeps it beside the kind envelope", () => {
    const text = 'Route 14 config:\n\n```json title="route-14.json"\n{"route": 14, "capacity": 38}\n```\n';
    const code = splitContentIntoBlocksV2(text).find((b) => b.type === "code");
    expect(code?.language).toBe("json");
    expect(code?.metadata?.[FENCE_META_KEY]).toBe('title="route-14.json"');
  });
});
