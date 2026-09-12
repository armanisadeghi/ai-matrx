/**
 * THE STRUCTURED-OUTPUT / WRITE-TARGET TRAP GUARD — the client-side twin of
 * the server kill switch.
 *
 * 🚨 THE TRAP (proven live 2026-08-18, `masterwork.rule_improver`
 * `c09465cb-…`, conversation `14786e08-7acd-491e-b2b7-6c220fd5f536`). A page
 * that declares agent-writable targets makes `buildToolInjection` hand EVERY
 * agent it launches the inline tool `apply_surface_write` (and that surface's
 * client tools, same mechanism). Give that tool to an agent whose contract is
 * to RETURN a structured object, and it does the reasonable thing: it CALLS
 * THE TOOL instead of answering. The run then sits at
 * `last_request_status: paused` forever — no error, no timeout, no output.
 * It reads as a broken stream, and every minute spent in the streaming code
 * is wasted.
 *
 * Until this module existed the only fix was a human setting
 * `tool_config.auto_tools_disabled` on the agent row — a manual rule written
 * in `common-docs/systems/mandates/RUNTIME.md`, obeyed by whoever happened to
 * have read it. That server kill switch stays exactly as it is; this is the
 * code guard beside it, so a run that would pause is never offered the tool
 * in the first place.
 *
 * WHY THIS IS NOT A PURE REDUX READ. The launch path hydrates an agent through
 * `agx_get_execution_full`, and NO execution RPC carries `output_schema`
 * (`agx_get_execution_minimal` = variables + context policies,
 * `agx_get_execution_full` adds model/settings/tools, `agx_get_list_full` is
 * identity only — see `features/mandates/output-contract.ts`). So on the very
 * path that springs the trap, Redux holds no answer at all: a guard that read
 * only the slice would report "no contract" for every mandate launch and
 * guard nothing. The order here is therefore:
 *
 *   1. the agent record in Redux, when the slice actually LOADED
 *      `outputSchema` (a builder/full fetch) — free and authoritative;
 *   2. the mandate's declared `output_kind`, when the mandate catalogue is
 *      already warm — free, never triggers a request;
 *   3. the canonical by-id read `fetchAgentOutputSchemas` (module-cached 5
 *      minutes) — one `.in("id", …)` select per agent per 5 minutes, and only
 *      ever reached on a surface that actually has write tools to withhold.
 *
 * A `null` verdict means "no structured output contract found", which is the
 * normal case and leaves injection exactly as it was.
 */

import type { RootState } from "@/lib/redux/store";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { hasField } from "@/features/agents/redux/shared/field-flags";
import { peekMandateCatalogueEntry } from "@/features/mandates/catalogue";
import { fetchAgentOutputSchemas } from "@/features/mandates/output-contract";
import { SURFACE_WRITE_TOOL_NAME } from "@/features/surfaces/runtime/surface-writeback";
import { isJsonObject } from "@/types/json";

export interface OutputContractVerdict {
  agentId: string;
  /** Display name when the slice knows it — never fetched just to log. */
  agentName: string | null;
  mandateKey: string | null;
  /** WHICH declaration proved the contract. */
  evidence:
    | "agent.output_schema"
    | "agent.output_schema (read by id)"
    | "mandate.output_kind";
  /** A finished clause naming the evidence, for the console line. */
  detail: string;
}

function schemaName(schema: unknown): string | null {
  if (!isJsonObject(schema)) return null;
  return typeof schema.name === "string" && schema.name ? schema.name : null;
}

/**
 * Whether this conversation's run carries a structured OUTPUT contract — i.e.
 * its job is to RETURN an object, not to act on the page.
 */
export async function resolveRunOutputContract(
  state: RootState,
  conversationId: string,
): Promise<OutputContractVerdict | null> {
  const conversation = state.conversations.byConversationId[conversationId];
  if (!conversation) return null;

  const agentId = conversation.agentId ?? null;
  const mandateKey = conversation.mandateKey ?? null;
  const record = agentId ? selectAgentById(state, agentId) : undefined;
  const agentName = record?.name ? record.name : null;

  // 1 — the agent's own declaration, when Redux really loaded it.
  const outputSchemaLoaded = record
    ? hasField(record._loadedFields, "outputSchema")
    : false;
  if (record && outputSchemaLoaded && record.outputSchema) {
    const name = record.outputSchema.name;
    return {
      agentId: record.id,
      agentName,
      mandateKey,
      evidence: "agent.output_schema",
      detail: name
        ? `it declares the output schema "${name}"`
        : "it declares a structured output schema",
    };
  }

  // 2 — the mandate's declared output kind, free when the catalogue is warm.
  if (mandateKey) {
    const entry = peekMandateCatalogueEntry(mandateKey);
    if (entry?.output_kind) {
      return {
        agentId: agentId ?? "",
        agentName,
        mandateKey,
        evidence: "mandate.output_kind",
        detail: `the job "${mandateKey}" declares output_kind "${entry.output_kind}"`,
      };
    }
  }

  // 3 — the by-id read. Skipped when the slice already proved the negative.
  if (!agentId || outputSchemaLoaded) return null;
  const schemas = await fetchAgentOutputSchemas([agentId]);
  const schema = schemas[agentId];
  if (!schema) return null;
  const name = schemaName(schema);
  return {
    agentId,
    agentName,
    mandateKey,
    evidence: "agent.output_schema (read by id)",
    detail: name
      ? `it declares the output schema "${name}"`
      : "it declares a structured output schema",
  };
}

/**
 * Nothing fails silently: say WHICH agent lost WHICH tools, on what evidence,
 * and what to do instead. Once per conversation — the verdict is stable for a
 * run, and a line per turn would train people to scroll past it.
 */
const announcedConversations = new Set<string>();

export function announceWithheldSurfaceWriteTools(
  verdict: OutputContractVerdict,
  conversationId: string,
  withheldClientToolNames: readonly string[],
): void {
  if (announcedConversations.has(conversationId)) return;
  announcedConversations.add(conversationId);
  const who = verdict.agentName ?? verdict.agentId ?? "this agent";
  const alsoWithheld =
    withheldClientToolNames.length > 0
      ? ` and this surface's client tools (${withheldClientToolNames.join(", ")})`
      : "";
  console.info(
    `[surface-writeback] "${who}" returns a structured result — ${verdict.detail}. ` +
      `Page write tools are withheld (${SURFACE_WRITE_TOOL_NAME}${alsoWithheld}) so it cannot pause the run ` +
      `by calling a tool instead of answering. Remedy: bind a non-structured agent to write the page. ` +
      `(evidence: ${verdict.evidence}${verdict.mandateKey ? `, job "${verdict.mandateKey}"` : ""})`,
  );
}
