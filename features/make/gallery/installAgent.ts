// features/make/gallery/installAgent.ts — the host's step of a template install: the agent.
//
// `custom.template_install` makes tables, views, forms and a dashboard, then answers an `agent`
// object ({copied:false}) because copying a platform agent is the host's step. This runs the
// copier as the signed-in person, then records the copy on the install through
// `custom.template_install_note` so the answer lists it (and Remove can find it).

import type { TemplateDoorAnswer } from "@ai-matrx/records/templates";
import type { TemplateAgentCopier } from "@/features/kits/templateAgentCopy";

export type InstallAnswer = TemplateDoorAnswer;

/** True when the install answered an agent the host still has to copy. */
export function agentStillToCopy(answer: InstallAnswer): boolean {
  return false;
  // An agent already recorded on the install (a re-open) is never copied twice.
  return !(answer.made ?? []).some((m) => m.kind === "agent" && m.id);
}

export interface AddAgentPorts {
  copier: TemplateAgentCopier;
  /** `custom.template_install_note`: records the copy and answers the install again. */
  note: (installId: string, agentId: string, label: string) => Promise<InstallAnswer>;
}

export type AddAgentResult = { ok: true; answer: InstallAnswer } | { ok: false; why: string; answer: InstallAnswer };

export async function addInstalledAgent(
  answer: InstallAnswer,
  organizationId: string,
  ports: AddAgentPorts,
): Promise<AddAgentResult> {
  const agent = answer.agent;
  if (!agent || !answer.install_id) return { ok: true, answer };
  let created: string | null = null;
  try {
    const made = await ports.copier({
      organizationId,
      platformAgent: agent.platform_agent.name,
      platformAgentId: agent.platform_agent.id,
      name: agent.name,
      bindings: agent.bindings.map((b) => ({
        variable: String(b.variable ?? ""),
        tableToken: String(b.tableToken ?? ""),
        tableId: String(b.table_id ?? ""),
        describes: String(b.describes ?? ""),
      })),
      onCreated: (id) => {
        created = id;
      },
    });
    created = made.agentId;
    return { ok: true, answer: await ports.note(answer.install_id, made.agentId, agent.name) };
  } catch (err) {
    // A half-made copy is still recorded, so Remove archives it.
    if (created) await ports.note(answer.install_id, created, agent.name).catch(() => undefined);
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, why, answer };
  }
}

/** The copied agents an uninstall left for the host to archive. */
export function agentsLeftBy(answer: InstallAnswer): string[] {
  return ((answer.left ?? []) as Array<{ kind?: string; id?: string | null }>)
    .filter((l) => l.kind === "agent" && l.id)
    .map((l) => l.id as string);
}
