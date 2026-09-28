/**
 * Declared offer values of provision `orchestras.member_roster`, sent by name
 * beside the member dump. The role describer launches on the MANDATE door
 * (`launchAgentExecution({ mandateKey })`), where the server drops these
 * mapped-only names unless a binding's consumption map names one — so the
 * current Holder receives exactly what it did before. Values come from the
 * Orchestra already loaded in Redux; absent facts are omitted (an unset mode
 * or depth budget is NOT filled with the platform default).
 */

import type { OrchestrasState } from "@/features/agents/redux/orchestras/slice";
import type { OrchestrasMemberRosterOffer } from "@/types/python-generated/provision-offers";

export type MemberRosterOfferValues = Omit<
  Partial<OrchestrasMemberRosterOffer>,
  "__kind" | "members"
>;

export function buildMemberRosterOffer(
  orchestras: Pick<OrchestrasState, "byId" | "list">,
  conductorId: string,
): MemberRosterOfferValues {
  const entry = orchestras.byId[conductorId];
  const summary = orchestras.list.find((s) => s.conductorId === conductorId);
  const config = entry?.config ?? summary?.config ?? {};
  const text = (v: string | null | undefined) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const label = text(entry?.label) ?? text(summary?.label) ?? text(summary?.name);
  const tagline = text(config.tagline);
  const mode = text(config.mode);
  const out: MemberRosterOfferValues = {
    conductor_id: conductorId,
    ...(label ? { orchestra_label: label } : {}),
    ...(mode ? { orchestra_mode: mode } : {}),
    ...(tagline ? { orchestra_tagline: tagline } : {}),
    ...(typeof config.depthBudget === "number" && Number.isFinite(config.depthBudget)
      ? { depth_budget: config.depthBudget }
      : {}),
    ...(entry ? { member_count: entry.members.length } : {}),
  };
  return out;
}
