import type {
  MatrxColumnDef,
  MatrxDataTableLocalDrillConfig,
} from "@ai-matrx/design-system/data-table";
import { formatCount } from "@ai-matrx/kit/format";
import type { CodexUsageRow } from "@/features/admin/codex-usage/service";

/**
 * One conversation on one model at one effort, as the drill reads it. `credits` is null
 * when Matrx Local could not price a row that has responses: the credit Measure says
 * "N unknown" beside the known part (nulls: "count") instead of adding it up as zero.
 */
export type CodexCell = {
  id: string;
  conversationId: string;
  conversation: string;
  kind: "Conversation" | "Worker";
  root: string;
  project: string;
  model: string;
  effort: string;
  responses: number;
  credits: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

const credits = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Local's `cells` rows are the one flat set every rollup table was a sum of. */
export function toCodexCells(cells: readonly CodexUsageRow[]): CodexCell[] {
  const titleOf = new Map<string, string>();
  for (const c of cells) {
    const id = c.conversation_id;
    if (id) titleOf.set(id, c.conversation_title ?? c.title ?? c.label ?? `Conversation ${id.slice(0, 8)}`);
  }
  return cells.map((c) => {
    const conversationId = c.conversation_id ?? "unknown";
    const responses = c.response_count ?? 0;
    const priced = c.estimated_standard_credits ?? null;
    return {
      id: `${conversationId}|${c.model ?? ""}|${c.effort ?? ""}`,
      conversationId,
      conversation: titleOf.get(conversationId) ?? `Conversation ${conversationId.slice(0, 8)}`,
      kind: c.root_id && c.root_id !== conversationId ? "Worker" : "Conversation",
      root: titleOf.get(c.root_id ?? conversationId) ?? "Unknown",
      project: c.project ?? "Unknown project",
      model: c.model ?? "Unknown model",
      effort: c.effort ?? "Unknown",
      responses,
      credits: priced == null && responses > 0 ? null : (priced ?? 0),
      inputTokens: c.input_tokens ?? 0,
      outputTokens: c.output_tokens ?? 0,
      totalTokens: c.total_tokens ?? 0,
    };
  });
}

const num = (v: number | null) => formatCount(v);

export const CODEX_COLUMNS: MatrxColumnDef<CodexCell>[] = [
  { accessorKey: "conversation", header: "Conversation", filter: "text", width: 260 },
  { accessorKey: "kind", header: "Kind", filter: "text", width: 120 },
  { accessorKey: "root", header: "Started from", filter: "text", width: 220 },
  { accessorKey: "project", header: "Project", filter: "text", width: 180 },
  { accessorKey: "model", header: "Model", filter: "text", width: 160 },
  { accessorKey: "effort", header: "Effort", filter: "text", width: 100 },
  {
    accessorKey: "responses",
    header: "Responses",
    filter: "number",
    align: "right",
    width: 110,
    cell: (r) => <span className="tabular-nums">{num(r.responses)}</span>,
  },
  {
    accessorKey: "credits",
    header: "Estimated standard credits",
    filter: "number",
    align: "right",
    width: 150,
    cell: (r) => (
      <span className="tabular-nums">
        {r.credits === null ? "Not available" : credits.format(r.credits)}
      </span>
    ),
  },
  {
    accessorKey: "inputTokens",
    header: "Input tokens",
    filter: "number",
    align: "right",
    width: 120,
    cell: (r) => <span className="tabular-nums">{num(r.inputTokens)}</span>,
  },
  {
    accessorKey: "outputTokens",
    header: "Output tokens",
    filter: "number",
    align: "right",
    width: 120,
    cell: (r) => <span className="tabular-nums">{num(r.outputTokens)}</span>,
  },
  {
    accessorKey: "totalTokens",
    header: "Tokens",
    filter: "number",
    align: "right",
    width: 110,
    cell: (r) => <span className="tabular-nums">{num(r.totalTokens)}</span>,
  },
];

const SHOW = ["sum_responses", "sum_credits", "sum_totalTokens"];

/**
 * LEVELS: a model shows its responses, credits and token split, and what ran on it by effort,
 * project and conversation; a project, the conversations in it and what they ran on; a
 * conversation, its model and effort mix plus its project, kind and parent. Credits keep
 * their unknown part (nulls: "count"); they are never silently summed.
 */
export const CODEX_DRILL: MatrxDataTableLocalDrillConfig = {
  local: true,
  countLabel: "Rows",
  dimensions: ["model", "effort", "project", "conversation", "kind"],
  measures: ["sum_responses", "sum_credits", "sum_inputTokens", "sum_outputTokens", "sum_totalTokens", "conversations"],
  extraDimensions: [
    { key: "model", label: "Model", kind: "choice", cardinality: "medium" },
    { key: "effort", label: "Effort", kind: "choice", cardinality: "low" },
    { key: "project", label: "Project", kind: "choice", cardinality: "medium" },
    { key: "conversation", label: "Conversation", kind: "choice", cardinality: "high" },
    { key: "kind", label: "Kind", kind: "choice", cardinality: "low" },
  ],
  extraMeasures: [
    { key: "sum_responses", label: "Responses", additive: true, op: "sum", of: "responses" },
    {
      key: "sum_credits",
      label: "Estimated standard credits",
      additive: true,
      op: "sum",
      of: "credits",
      nulls: "count",
      format: (v) => (v === null ? "Not available" : credits.format(v)),
    },
    { key: "sum_inputTokens", label: "Input tokens", additive: true, op: "sum", of: "inputTokens" },
    { key: "sum_outputTokens", label: "Output tokens", additive: true, op: "sum", of: "outputTokens" },
    { key: "sum_totalTokens", label: "Tokens", additive: true, op: "sum", of: "totalTokens" },
    { key: "conversations", label: "Conversations", additive: false, op: "count_distinct", of: "conversationId" },
  ],
  levels: {
    model: {
      breakouts: ["effort", "project", "conversation", "kind"],
      attributes: [],
      show: ["sum_responses", "sum_credits", "sum_inputTokens", "sum_outputTokens", "conversations"],
    },
    effort: {
      breakouts: ["model", "project", "conversation", "kind"],
      attributes: [],
      show: ["sum_responses", "sum_credits", "sum_totalTokens", "conversations"],
    },
    project: {
      breakouts: ["conversation", "model", "effort", "kind"],
      attributes: [],
      show: ["conversations", "sum_responses", "sum_credits", "sum_totalTokens"],
    },
    conversation: {
      breakouts: ["model", "effort"],
      attributes: ["project", "kind", "root"],
      show: ["sum_responses", "sum_credits", "sum_inputTokens", "sum_outputTokens"],
    },
    kind: {
      breakouts: ["project", "model", "effort", "conversation"],
      attributes: [],
      show: ["conversations", ...SHOW],
    },
  },
};
