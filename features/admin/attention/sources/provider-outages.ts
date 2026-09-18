/**
 * Provider outages as attention items — the PURE half of the outage source.
 *
 * THE DEFECT THIS EXISTS FOR (Arman, 2026-09-12, 23:55Z). Anthropic refused
 * every call from 20:31Z to 23:21Z and no screen said so. His ruling:
 *
 *   "When the api goes down, my page, as a super admin should show VERY loud
 *    errors telling me there is a major problem. But this can't be something
 *    that complains constantly."
 *
 * The server owns "is it still down": `/admin/system-errors/open-outages`
 * opens ONE row per provider per outage and closes it when calls succeed
 * again. An outage has no row of its own a person can annotate, so its mute
 * is LOCAL (this browser) and keyed by the server's outage id — silencing
 * Anthropic being down this morning says nothing about OpenAI this afternoon,
 * or about Anthropic going down again tomorrow (a new id).
 */

import {
  describeOutage,
  OUTAGE_DETAILS_HREF,
  type OpenOutage,
} from "@/features/admin/system-errors/open-outages";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import type { AttentionItem } from "../types";

export const PROVIDER_OUTAGE_SOURCE_ID = "provider-outages";
export const PROVIDER_OUTAGE_SOURCE_LABEL = "AI providers";

function providerLabel(provider: string): string {
  if (!provider) return "A provider";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export interface ProviderOutageDeps {
  muteLocally: (key: string, ms: number) => void;
  unmuteLocally: (key: string) => void;
  now?: number;
}

export function providerOutageItems(
  outages: readonly OpenOutage[],
  deps: ProviderOutageDeps,
): AttentionItem[] {
  const now = deps.now ?? Date.now();
  return outages.map((outage) => {
    const key = `${PROVIDER_OUTAGE_SOURCE_ID}:${outage.id}`;
    return {
      key,
      sourceId: PROVIDER_OUTAGE_SOURCE_ID,
      id: outage.id,
      severity: "critical",
      title: providerLabel(outage.provider),
      state: `down since ${humanizeRelative(outage.first_seen_at)}`,
      sentence: describeOutage(outage, now).sentence,
      about: null,
      record: null,
      doors: [
        {
          kind: "evidence",
          href: OUTAGE_DETAILS_HREF,
          label: "The recorded failures",
          what: "Every refused call, filtered to provider outages.",
        },
      ],
      impactDeclared: null,
      actions: [],
      mute: {
        scope: "local",
        current: null,
        apply: async (untilMs) => {
          deps.muteLocally(key, Math.max(0, untilMs - now));
        },
        clear: async () => {
          deps.unmuteLocally(key);
        },
      },
    };
  });
}

/** "Anthropic is down. Every call to it is failing right now." */
export function summarizeProviderOutages(items: readonly AttentionItem[]): string | null {
  if (items.length === 0) return null;
  if (items.length === 1) return `${items[0].title} is down — every call to it is failing right now.`;
  return `${items.length} providers are down — every call to them is failing right now.`;
}
