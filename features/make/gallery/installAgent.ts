// features/make/gallery/installAgent.ts — the host's steps of a template install: agents and workflows.
//
// `custom.template_install` makes tables, views, forms and a dashboard, then answers an `agent`
// object ({copied:false}) because copying a platform agent is the host's step. This runs the
// copier as the signed-in person, then records the copy on the install through
// `custom.template_install_note` so the answer lists it (and Remove archives it).
//
// Kits → Template merge (2026-10-04): a template may also carry full merge-field bindings on its
// agent's variables, extra agents and workflows. The door's answer then has a `host` block (the
// plan's extras and the ids to resolve them: `tables.<token>`, `row.<token>.<row key>`). Each extra
// agent is copied and noted (kind 'agent'), each workflow created through aidream `POST /workflows`
// with `{{table:…}}` / `{{agent:…}}` resolved and noted (kind 'workflow'). A re-open resumes:
// what the install already lists (by its title) is never made twice.
//
// CLAIM, THEN CREATE (2026-10-05): every agent and workflow is first CLAIMED on the install
// (`custom.template_install_claim`, kind + title) and only then created, so a page closed between
// the create and the note leaves a claim, not an unrecorded copy. A re-open taking over a stale
// claim gets the orphans that run made: the first is finished and recorded, any others archived.
// A fresh claim held by another tab stops this run with a sentence — it never creates beside it.

import type { TemplateDoorAnswer } from "@ai-matrx/records/templates";
import type { TemplateAgentBinding, TemplateAgentCopier } from "@/features/templates/agentCopy";
import { buildMergeFieldBinding, resolveIdPlaceholders, type MergeBindingResolver, type MergeFieldBinding } from "./mergeBinding";

export type InstallAnswer = TemplateDoorAnswer;

// The plan's host parts as the door answers them (@ai-matrx/records >= 0.70.0 templates/extras.ts:
// TemplatePlanBinding / TemplatePlanExtraAgent / TemplateWorkflow), read structurally from the
// answer so an older package or a template without them reads as "nothing to do".
export interface TemplatePlanBinding {
  semantic: "collection" | "reference" | "value";
  table: string;
  rowKey?: string;
  field?: string;
  transform?: { name: string; template?: string; join?: string; max?: number; header?: string };
  limit?: number;
  sort?: { field: string; dir: "asc" | "desc" };
  match?: Record<string, unknown>;
  missing?: string;
}
export interface TemplatePlanExtraAgent {
  key: string;
  platformAgent: { id: string; name: string };
  name: string;
  bindings: Array<{ variable: string; describes: string; binding: TemplatePlanBinding }>;
}
export interface TemplateWorkflow {
  key: string;
  name: string;
  description: string;
  definition: unknown;
}
type HostBlock = { extra_agents?: TemplatePlanExtraAgent[] | null; workflows?: TemplateWorkflow[] | null; ids?: Record<string, string> } | null;

type Made = { kind: string; id: string | null; title: string | null; ref?: string };

function madeOf(answer: InstallAnswer, kind: "agent" | "workflow"): Made[] {
  return ((answer.made ?? []) as Made[]).filter((m) => m.kind === kind && m.id);
}

function hostOf(answer: InstallAnswer) {
  const host = (answer["host"] ?? null) as HostBlock;
  return {
    extras: (host?.extra_agents ?? []) as TemplatePlanExtraAgent[],
    workflows: (host?.workflows ?? []) as TemplateWorkflow[],
    ids: (host?.ids ?? {}) as Record<string, string>,
  };
}

/** True when the install answered an agent the host still has to copy. */
export function agentStillToCopy(answer: InstallAnswer): boolean {
  if (!answer.agent || answer.agent.copied) return false;
  // An agent already recorded on the install (a re-open) is never copied twice.
  return !madeOf(answer, "agent").length;
}

/** True when any host step (the agent, an extra agent, a workflow) is still to be made. */
export function hostStepsPending(answer: InstallAnswer): boolean {
  if (agentStillToCopy(answer)) return true;
  const { extras, workflows } = hostOf(answer);
  const agents = new Set(madeOf(answer, "agent").map((m) => m.title));
  const flows = new Set(madeOf(answer, "workflow").map((m) => m.title));
  return extras.some((a) => !agents.has(a.name)) || workflows.some((w) => !flows.has(w.name));
}

/** The ids the install made, as the shared binding builder reads them. */
export function installResolver(answer: InstallAnswer): MergeBindingResolver {
  const { ids } = hostOf(answer);
  const made = (answer.made ?? []) as Made[];
  return {
    tableId: (token) => ids[`tables.${token}`] ?? made.find((m) => m.kind === "table" && m.ref === `tables.${token}`)?.id ?? null,
    recordId: (token, row) => (typeof row === "string" ? ids[`row.${token}.${row}`] : null),
  };
}

/** A plan binding (template-local handles) → the installed merge-field binding. */
export function installedBinding(b: TemplatePlanBinding, resolver: MergeBindingResolver): MergeFieldBinding {
  return buildMergeFieldBinding(
    {
      semantic_type: b.semantic,
      ...(b.field ? { field_key: b.field } : {}),
      ...(b.transform ? { transform: b.transform } : {}),
      ...(b.limit !== undefined ? { limit: b.limit } : {}),
      ...(b.sort ? { sort: b.sort } : {}),
      ...(b.match ? { match: b.match } : {}),
      ...(b.missing ? { missing: b.missing } : {}),
    },
    b.table,
    b.rowKey,
    resolver,
  );
}

export interface AddAgentPorts {
  copier: TemplateAgentCopier;
  /** The copier for extra agents (kits never gave them the records tool). Default: `copier`. */
  extraCopier?: TemplateAgentCopier;
  /** `custom.template_install_note`: records a copy (or, with kind 'workflow', a workflow) and answers the install again. */
  note: (installId: string, id: string, label: string, kind?: "workflow") => Promise<InstallAnswer>;
  /** Archives an agent an interrupted run made twice. */
  archiveAgent?: (agentId: string) => Promise<void>;
  /**
   * `custom.template_install_claim`: claims (kind, title) on the install BEFORE it is created.
   * Answers `made` (already recorded: its id), `held` (another tab is making it) or `claimed`
   * (go ahead; `orphans` = what an interrupted run made and never recorded).
   */
  claim: (installId: string, kind: "agent" | "workflow", label: string, sourceId: string | null) => Promise<Claim>;
  /** Archives a workflow an interrupted run made twice. */
  archiveWorkflow?: (workflowId: string) => Promise<void>;
  /** aidream `POST /workflows` in `organizationId`, as the person. Returns the workflow's id. */
  createWorkflow?: (organizationId: string, workflow: { name: string; description: string; definition: unknown }) => Promise<string>;
}

export type Claim =
  | { state: "made"; id: string }
  | { state: "held"; retryAt: string | null }
  | { state: "claimed"; orphans: string[] };

/** Another tab holds the claim; `retryAt` is when its hold runs out (null when unknown). */
export class HeldElsewhere extends Error {
  constructor(what: string, readonly retryAt: string | null) {
    super(`"${what}" is being made in another tab or window.`);
  }
}

export type AddAgentResult = { ok: true; answer: InstallAnswer } | { ok: false; why: string; answer: InstallAnswer; retryAt?: string | null };

async function copyAndNote(
  copier: TemplateAgentCopier,
  ports: AddAgentPorts,
  installId: string,
  organizationId: string,
  agent: { platformAgentId: string; platformAgent: string; name: string; bindings: TemplateAgentBinding[] },
): Promise<{ answer: InstallAnswer; agentId: string }> {
  const claim = await ports.claim(installId, "agent", agent.name, agent.platformAgentId || null);
  if (claim.state === "made") return { agentId: claim.id, answer: await ports.note(installId, claim.id, agent.name) };
  if (claim.state === "held") throw new HeldElsewhere(agent.name, claim.retryAt);
  const [adopt, ...extra] = claim.orphans;
  let created: string | null = adopt ?? null;
  try {
    // Copies an interrupted run made twice: archived, so exactly one stays.
    for (const id of extra) await ports.archiveAgent?.(id);
    const made = await copier({
      organizationId,
      ...agent,
      ...(adopt ? { existingAgentId: adopt } : {}),
      onCreated: (id) => {
        created = id;
      },
    });
    return { agentId: made.agentId, answer: await ports.note(installId, made.agentId, agent.name) };
  } catch (err) {
    // A half-made copy is still recorded, so Remove archives it.
    if (created) await ports.note(installId, created, agent.name).catch(() => undefined);
    throw err;
  }
}

export async function addInstalledAgent(
  answer: InstallAnswer,
  organizationId: string,
  ports: AddAgentPorts,
): Promise<AddAgentResult> {
  const installId = answer.install_id;
  if (!installId) return { ok: true, answer };
  let current = answer;
  try {
    const resolver = installResolver(answer);
    const agentIds: Record<string, string> = {};

    // 1 — the template's agent.
    const agent = answer.agent;
    if (agent && agentStillToCopy(current)) {
      const done = await copyAndNote(ports.copier, ports, installId, organizationId, {
        platformAgent: agent.platform_agent.name,
        platformAgentId: agent.platform_agent.id,
        name: agent.name,
        bindings: agent.bindings.map((b) => {
          const full = b["binding"] as TemplatePlanBinding | undefined;
          return {
            variable: String(b["variable"] ?? ""),
            tableToken: String(b["tableToken"] ?? ""),
            tableId: String(b["table_id"] ?? ""),
            describes: String(b["describes"] ?? ""),
            ...(full ? { binding: installedBinding(full, resolver) } : {}),
          };
        }),
      });
      current = done.answer;
      agentIds["agent"] = done.agentId;
    } else if (agent) {
      const prior = madeOf(current, "agent").find((m) => m.title === agent.name) ?? madeOf(current, "agent")[0];
      if (prior?.id) agentIds["agent"] = prior.id;
    }

    // 2 — extra agents, each bound through the same builder.
    const { extras, workflows, ids } = hostOf(answer);
    for (const extra of extras) {
      const prior = madeOf(current, "agent").find((m) => m.title === extra.name);
      if (prior?.id) {
        agentIds[extra.key] = prior.id;
        continue;
      }
      const done = await copyAndNote(ports.extraCopier ?? ports.copier, ports, installId, organizationId, {
        platformAgent: extra.platformAgent.name,
        platformAgentId: extra.platformAgent.id,
        name: extra.name,
        bindings: extra.bindings.map((b) => {
          const binding = installedBinding(b.binding, resolver);
          return { variable: b.variable, tableToken: b.binding.table, tableId: binding.table_id, describes: b.describes, binding };
        }),
      });
      current = done.answer;
      agentIds[extra.key] = done.agentId;
    }

    // 3 — workflows, placeholders resolved to what this install made.
    if (workflows.length) {
      const tables = Object.fromEntries(Object.entries(ids).filter(([k]) => k.startsWith("tables.")).map(([k, v]) => [k.slice(7), v]));
      for (const wf of workflows) {
        if (madeOf(current, "workflow").some((m) => m.title === wf.name)) continue;
        if (!ports.createWorkflow) throw new Error(`The workflow "${wf.name}" could not be made: this screen cannot create workflows.`);
        const claim = await ports.claim(installId, "workflow", wf.name, null);
        if (claim.state === "held") throw new HeldElsewhere(wf.name, claim.retryAt);
        let workflowId: string;
        if (claim.state === "made") workflowId = claim.id;
        else if (claim.orphans.length) {
          const [adopt, ...extra] = claim.orphans as [string, ...string[]];
          for (const id of extra) await ports.archiveWorkflow?.(id);
          workflowId = adopt;
        } else {
          const definition = resolveIdPlaceholders(wf.definition, { table: tables, agent: agentIds });
          workflowId = await ports.createWorkflow(organizationId, { name: wf.name, description: wf.description, definition });
        }
        current = await ports.note(installId, workflowId, wf.name, "workflow");
      }
    }
    return { ok: true, answer: current };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, why, answer: current, ...(err instanceof HeldElsewhere ? { retryAt: err.retryAt } : {}) };
  }
}

/** The copied agents an uninstall left for the host to archive. */
export function agentsLeftBy(answer: InstallAnswer): string[] {
  return ((answer.left ?? []) as Array<{ kind?: string; id?: string | null }>)
    .filter((l) => l.kind === "agent" && l.id)
    .map((l) => l.id as string);
}
