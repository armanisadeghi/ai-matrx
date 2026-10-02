// features/kits/templateAgentCopy.ts — the host's `copyAgent` for template installs.
//
// `installTemplate(client, orgId, spec, { copyAgent })` in @ai-matrx/records
// (aidream/apps/shared/records/src/templates/install.ts) installs a template through
// store doors and hands the ONE step it cannot take — copying a platform agent and
// binding its variables to the installed tables — to the host. This is that step,
// built on the kit installer's own path (installer.ts), never a second one:
//
//   1. the platform agent the template names (its id, or its name in the system org)
//   2. `agx_duplicate_agent` through the `duplicateAgent` thunk — the ONE fork, as the person
//   3. named from the template (`nameCopiedAgent`: next free name, guarded write)
//   4. each template variable bound to its installed table as a `merge_field`
//      collection (the kit binding shape), its default cleared — the bound value is the truth
//   5. the `records` tool attached, so the copy answers a sum or a count through
//      `custom.record_aggregate` instead of adding rows up in its head (handoff Q6)
//
// A failure after the fork archives the copy (`deleted_at`, soft) and says so: the
// template footprint only learns an agent id from a successful return, so a copy left
// behind would be an orphan nobody can find.

// This file holds no app imports (types only), so a node script can run the same
// copier against the clone with its own ports; the browser wiring is
// `templateAgentCopyHost.ts`.
import type { Json } from "@/types/database.types";
import type { AgentRow } from "./installer";
import type { MergeFieldBinding } from "./types";

// ─── the contract (structurally identical to @ai-matrx/records templates/install.ts) ──
// The package does not export its templates entry yet, so the request is declared here
// with the same shape; a function of this type IS a valid `copyAgent`.

export interface TemplateAgentBinding {
  variable: string;
  tableToken: string;
  tableId: string;
  describes: string;
}

export interface TemplateAgentCopyRequest {
  organizationId: string;
  platformAgent: string;
  platformAgentId: string | null;
  name: string;
  bindings: TemplateAgentBinding[];
}

export type TemplateAgentCopier = (request: TemplateAgentCopyRequest) => Promise<{ agentId: string }>;

// ─── the knobs of this step ──────────────────────────────────────────────────

export interface TemplateAgentCopyOptions {
  /**
   * Rows a bound collection hands the agent. The resolver's own default is 40 and a
   * template's main table carries 20–50 rows, so the default would silently cut the
   * set a question is asked about. Every row of a template-sized table fits.
   */
  collectionLimit?: number;
  /** Attach the `records` tool when the source agent lacks it. Default true. */
  attachRecordsTool?: boolean;
}

export const TEMPLATE_AGENT_COLLECTION_LIMIT = 500;

// ─── the pure part: bindings onto raw variable definitions ───────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The merge-field binding one template variable gets: the whole installed table. */
export function templateBinding(binding: TemplateAgentBinding, limit: number): MergeFieldBinding {
  return {
    kind: "merge_field",
    source: "record",
    semantic_type: "collection",
    table_id: binding.tableId,
    limit,
    missing: "absent",
    override_policy: "shown_locked",
  };
}

/**
 * The copied agent's `variable_definitions`, with each template variable bound.
 * Read and written RAW, like the kit installer: every other key of every variable
 * is kept byte-for-byte. A template naming a variable the agent does not have, or a
 * table the install did not create, is a named failure — never a skipped binding.
 */
export function bindTemplateVariables(
  definitions: unknown,
  bindings: TemplateAgentBinding[],
  limit: number,
): unknown[] {
  const defs = Array.isArray(definitions) ? definitions.map((d) => (isRecord(d) ? { ...d } : d)) : [];
  for (const b of bindings) {
    if (!b.tableId) {
      throw new Error(`The template binds "${b.variable}" to its "${b.tableToken}" table, which was not created.`);
    }
    const idx = defs.findIndex((d) => isRecord(d) && d.name === b.variable);
    if (idx < 0) {
      throw new Error(`The copied agent has no "${b.variable.replace(/_/g, " ")}" input to connect.`);
    }
    const def = defs[idx] as Record<string, unknown>;
    def.binding = templateBinding(b, limit);
    def.defaultValue = null;
  }
  return defs;
}

/** `tools` with `recordsToolId` added once (order kept). */
export function withTool(tools: string[] | null, toolId: string): string[] {
  const list = tools ?? [];
  return list.includes(toolId) ? list : [...list, toolId];
}

// ─── the ports (real ones below; tests pass their own) ───────────────────────

export interface TemplateAgentCopyPorts {
  /** The system org's agent with this exact name; exactly one, or a named failure. */
  platformAgentIdByName(name: string): Promise<string>;
  /** `agx_duplicate_agent` into `organizationId`, as the person. Returns the copy's id. */
  duplicate(sourceAgentId: string, organizationId: string): Promise<string>;
  /** Names the copy (next free name). Returns the name kept. */
  name(agentId: string, organizationId: string, base: string): Promise<string>;
  /** One guarded write to the copy. */
  write(
    agentId: string,
    what: string,
    build: (current: AgentRow) => Partial<{ tools: string[]; variable_definitions: Json; deleted_at: string }>,
  ): Promise<void>;
  /** The `records` tool's id, or null when it cannot be read. */
  recordsToolId(): Promise<string | null>;
}

export function createTemplateAgentCopier(
  ports: TemplateAgentCopyPorts,
  options: TemplateAgentCopyOptions = {},
): TemplateAgentCopier {
  const limit = options.collectionLimit ?? TEMPLATE_AGENT_COLLECTION_LIMIT;
  const attachRecords = options.attachRecordsTool ?? true;

  return async (request) => {
    const sourceId = request.platformAgentId ?? (await ports.platformAgentIdByName(request.platformAgent));
    const agentId = await ports.duplicate(sourceId, request.organizationId);
    try {
      await ports.name(agentId, request.organizationId, request.name);
      const toolId = attachRecords ? await ports.recordsToolId() : null;
      if (attachRecords && !toolId) {
        throw new Error("The records tool could not be read, so the copy could not be given it.");
      }
      await ports.write(agentId, "connect the agent's variables to your tables", (cur) => ({
        variable_definitions: bindTemplateVariables(cur.variable_definitions, request.bindings, limit) as Json,
        ...(toolId ? { tools: withTool(cur.tools, toolId) } : {}),
      }));
      return { agentId };
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      try {
        await ports.write(agentId, "archive the unfinished copy", () => ({ deleted_at: new Date().toISOString() }));
      } catch (archiveErr) {
        const a = archiveErr instanceof Error ? archiveErr.message : String(archiveErr);
        throw new Error(`${why} The unfinished copy ${agentId} could not be archived: ${a}`);
      }
      throw new Error(`${why} The unfinished copy was archived.`);
    }
  };
}
