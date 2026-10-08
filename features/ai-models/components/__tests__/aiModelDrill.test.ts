import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillDroppedItems,
  drillLevelProblems,
  emptyDrillQuestion,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { AI_MODEL_DRILL } from "../aiModelDrill";

const m = (o: Record<string, unknown>) => ({
  maker: "anthropic",
  hosted_by: "Anthropic API",
  input_kinds: "image + text",
  output_kinds: "text",
  is_premium: false,
  is_deprecated: false,
  is_primary: false,
  input_price: 3,
  output_price: 15,
  cached_input_price: 0.3,
  context_window: 200000,
  max_tokens: 8000,
  ...o,
});

const rows = [
  m({}),
  m({ input_price: 1, output_price: 5, context_window: 100000 }),
  m({ maker: "openai", hosted_by: "OpenAI API", input_price: null, output_price: null, context_window: 128000 }),
];
// The ids the table's own columns carry (AiModelTable: the catalog columns plus its hosted_by / input_kinds / output_kinds).
const columns = [
  { id: "maker", accessorKey: "maker", header: "maker" },
  { id: "hosted_by", accessorKey: "hosted_by", header: "hosted_by" },
  { id: "input_kinds", accessorKey: "input_kinds", header: "input_kinds" },
  { id: "output_kinds", accessorKey: "output_kinds", header: "output_kinds" },
  { id: "is_premium", accessorKey: "is_premium", header: "is_premium" },
  { id: "is_deprecated", accessorKey: "is_deprecated", header: "is_deprecated" },
  { id: "is_primary", accessorKey: "is_primary", header: "is_primary" },
  { id: "input_price", accessorKey: "input_price", header: "input_price" },
  { id: "output_price", accessorKey: "output_price", header: "output_price" },
  { id: "cached_input_price", accessorKey: "cached_input_price", header: "cached_input_price" },
  { id: "context_window", accessorKey: "context_window", header: "context_window" },
  { id: "max_tokens", accessorKey: "max_tokens", header: "max_tokens" },
] as MatrxColumnDef<Record<string, unknown>>[];
const config = drillConfigFromColumns(columns, rows, AI_MODEL_DRILL);

describe("ai model drill", () => {
  it("declares only levels its Dimensions and Measures honour", () => {
    expect(
      drillLevelProblems(config.dimensions, config.measures, {
        attributeKeys: ["maker", "hosted_by", "input_kinds", "output_kinds"],
      }),
    ).toEqual([]);
  });

  it("drops nothing it was asked to offer", () => {
    expect(drillDroppedItems(config.dimensions, AI_MODEL_DRILL)).toEqual([]);
  });

  it("a maker's prices average the known ones and say how many are unknown", () => {
    const q = { ...emptyDrillQuestion(["count", "avg_input_price"]), by: ["maker"] };
    const groups = (drillAnswerLocally(rows, q, config).maker ?? []) as unknown as {
      groups: { maker: string };
      measures: Record<string, number | null>;
      unknown?: Record<string, number>;
    }[];
    const anthropic = groups.find((g) => g.groups.maker === "anthropic");
    expect(anthropic?.measures.count).toBe(2);
    expect(anthropic?.measures.avg_input_price).toBe(2);
    const openai = groups.find((g) => g.groups.maker === "openai");
    expect(openai?.unknown?.avg_input_price).toBe(1);
  });
});
