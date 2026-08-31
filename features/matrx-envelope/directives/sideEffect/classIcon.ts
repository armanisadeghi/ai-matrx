/**
 * The icon for a side-effect directive card.
 *
 * THE CLASS LEADS, deliberately: on a card whose job is "authorize this write",
 * the single most important thing to see before reading a word is whether this
 * CREATES, CHANGES, or DELETES. A noun icon is decoration next to that; a
 * delete that looks like a create is a trap.
 *
 * A noun override exists only where the platform has a settled visual identity
 * for the thing — agents are a Webhook, never a robot (house rule: agents are
 * not toys) — and only for the `action` class, where the verb is generic.
 */

import {
  FilePlus2,
  PencilLine,
  Play,
  Trash2,
  Webhook,
  type LucideIcon,
} from "lucide-react";

const BY_CLASS: Record<string, LucideIcon> = {
  create: FilePlus2,
  update: PencilLine,
  delete: Trash2,
  action: Play,
};

/** Nouns whose identity is stronger than the generic `action` verb. */
const AGENT_NOUNS = new Set([
  "create_agent",
  "create_agent_definition",
  "agent",
]);

export function classIcon(directiveClass: string, noun: string): LucideIcon {
  if (directiveClass === "action" && AGENT_NOUNS.has(noun)) return Webhook;
  return BY_CLASS[directiveClass] ?? Play;
}
