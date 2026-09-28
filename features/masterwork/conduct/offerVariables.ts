// features/masterwork/conduct/offerVariables.ts
//
// The `masterwork.conduct` offered values a FRESH Conductor launch holds as
// real facts, sent by name beside rulebook_id / attachments / rulebook_document.
// The launch is on the AGENT door (useAgentLauncher(agentId)); the live Holder
// (Masterwork Conductor) neither declares nor templates any of these names
// (checked live 2026-09-28), so its payload is unchanged. They become mappable
// only after the site moves to the mandate door (owner's call).

import type { MasterworkConductOffer } from "@/types/python-generated/provision-offers";
import type { RulebookOfferFacts } from "../agent-context/rulebookDocument";
import type { MasterworkAttachment } from "./service";

export function conductorOfferVariables(
  facts: RulebookOfferFacts | null,
  attachments: MasterworkAttachment[],
): Partial<MasterworkConductOffer> {
  const out: Partial<MasterworkConductOffer> = {
    // A fresh launch is never a resume — ResumedConductorSession never launches.
    is_resumed_session: false,
  };
  const names = attachments.map((a) => a.name).filter((n) => n?.trim());
  if (names.length > 0) out.attachment_names = names;
  if (!facts) return out;
  out.rulebook_name = facts.rulebook_name;
  out.rule_count = facts.rule_count;
  if (facts.rulebook_status) out.rulebook_status = facts.rulebook_status;
  if (facts.rulebook_version !== undefined)
    out.rulebook_version = facts.rulebook_version;
  if (facts.open_feedback) out.open_feedback = facts.open_feedback;
  return out;
}
