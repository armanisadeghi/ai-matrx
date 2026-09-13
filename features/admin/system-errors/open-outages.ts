/**
 * Open provider outages — the read and the pure sentence a super-admin gets.
 *
 * THE DEFECT THIS EXISTS FOR (Arman, 2026-09-12, 23:55Z). Anthropic refused
 * EVERY call between 20:31Z and 23:21Z — nearly three hours in which no AI
 * work on the platform could succeed — and not one screen said so. The rows
 * were being written the whole time; the only reader was a page you open when
 * you already suspect the problem. His ruling:
 *
 *   "When the api goes down, my page, as a super admin should show VERY loud
 *    errors telling me there is a major problem. But this can't be something
 *    that complains constantly. It needs to tell us when big things happen
 *    like when an api like this is down."
 *
 * The server owns "is it still down": `/admin/system-errors/open-outages`
 * opens ONE row per provider per outage and closes it when calls succeed
 * again. The client never dedupes, never decides, never accumulates — an
 * empty array means every provider is healthy, and it renders nothing.
 *
 * WHY `getJson` AND NOT `apiGet`. `lib/api/typed-client`'s `apiGet` is bound
 * to the generated OpenAPI contract, and this path is not in
 * `types/python-generated/api-types.ts` yet (the aidream half landed after
 * this file). A generated file is NEVER hand-edited, so the honest thing is
 * the raw typed helper plus the declared response shape below. MOVE THIS TO
 * `apiGet("/admin/system-errors/open-outages")` the moment `pnpm sync-types`
 * carries the path — at that point this local interface becomes a
 * hand-mirrored contract, which is the exact class typed-client exists to
 * kill. A failed read is already captured once into the Error Inspector by
 * `lib/python-client` (`capturePythonClientError`); this module adds no
 * second channel and no toast.
 */

import { getJson } from "@/lib/python-client";
import { formatDistanceStrict } from "date-fns";

/** One open provider outage, exactly as the server reports it. */
export interface OpenOutage {
  id: string;
  provider: string;
  error_type: string;
  error_text: string;
  first_seen_at: string;
  consecutive_failures: number;
  models_affected: string[];
  rerouted_to: string[] | null;
  occurred_at: string;
}

interface OpenOutagesResponse {
  outages: OpenOutage[];
}

export const OPEN_OUTAGES_PATH = "/admin/system-errors/open-outages";

/** The deep link the notice's "See details" opens — the evidence, filtered. */
export const OUTAGE_DETAILS_HREF =
  "/administration/utilities/system-errors?kind=provider_outage";

export async function fetchOpenOutages(): Promise<OpenOutage[]> {
  const { data } = await getJson<OpenOutagesResponse>(OPEN_OUTAGES_PATH);
  return Array.isArray(data?.outages) ? data.outages : [];
}

/** One outage, one sentence a person reads without decoding anything. */
export interface OutageLine {
  id: string;
  provider: string;
  /** The whole sentence, ready to render. */
  sentence: string;
}

function providerLabel(provider: string): string {
  if (!provider) return "A provider";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * "Anthropic is refusing every call since 2 hours ago — 214 failures,
 *  overloaded_error; traffic is being rerouted to openai."
 *
 * Pure and `now`-injected so the negative case and the wording are provable
 * without a live outage and without a frozen clock.
 */
export function describeOutage(
  outage: OpenOutage,
  now: number = Date.now(),
): OutageLine {
  const since = new Date(outage.first_seen_at);
  const age = Number.isNaN(since.getTime())
    ? "an unknown time"
    : formatDistanceStrict(since, new Date(now));
  const failures =
    outage.consecutive_failures === 1
      ? "1 failure"
      : `${outage.consecutive_failures} failures`;
  const rerouted =
    outage.rerouted_to && outage.rerouted_to.length > 0
      ? `traffic is being rerouted to ${outage.rerouted_to.join(", ")}`
      : "there is no fallback — this work is not running anywhere";
  return {
    id: outage.id,
    provider: outage.provider,
    sentence: `${providerLabel(outage.provider)} is refusing every call since ${age} ago — ${failures}, ${outage.error_type}; ${rerouted}.`,
  };
}

/**
 * The notice, or `null` when there is nothing to say. `null` is the only
 * honest answer for an empty list: a bar that says "all providers healthy" on
 * every page is wallpaper, and wallpaper is how the next outage gets missed.
 */
export function buildOutageNotice(
  outages: readonly OpenOutage[],
  now: number = Date.now(),
): { lines: OutageLine[]; title: string } | null {
  if (outages.length === 0) return null;
  const lines = outages.map((outage) => describeOutage(outage, now));
  const title =
    lines.length === 1
      ? `${providerLabel(lines[0].provider)} is down. Every call to it is failing right now.`
      : `${lines.length} providers are down. Every call to them is failing right now.`;
  return { lines, title };
}
