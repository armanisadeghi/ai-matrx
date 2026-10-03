/**
 * WHAT A SERVER BADGE MAY CLAIM — the truth about where this app's calls go.
 *
 * WHY (reviewer, 2026-10-02): the directive builder's header said
 * "production http://localhost:8200" while it was serving the nightly clone.
 * "production" is the NAME of the selected server slot (`activeServer`), and a
 * process wired to the clone rewrites a slot's URL to a clone-wired local
 * aidream, so the slot name and the place the calls actually land can disagree.
 * A badge must say where the calls land.
 *
 * Two facts decide it, both already this app's own values:
 *  - the DATABASE, from `NEXT_PUBLIC_SUPABASE_URL` (production is the custom
 *    domain or the production ref — the same test the outbound guard uses);
 *  - the SERVER, from the resolved base URL (a loopback host is a local server).
 */

import { PRODUCTION_HOSTS } from "@/lib/communications/outbound-guard";

export type ServerTargetKind = "production" | "clone" | "local" | "other";

export interface ServerTarget {
  kind: ServerTargetKind;
  /** One word for the badge: "Production", "Clone", "Local", or the slot name. */
  label: string;
  /** The host the calls go to ("localhost:8200"), or null with no base URL. */
  host: string | null;
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\]|[^.]+\.localhost)(:\d+)?$/i;

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function describeServerTarget(input: {
  /** The selected slot's NAME (`apiConfig.activeServer`). Never shown as fact. */
  activeServer: string;
  baseUrl: string | null | undefined;
  supabaseUrl: string | null | undefined;
}): ServerTarget {
  const host = hostOf(input.baseUrl);
  const dbHost = hostOf(input.supabaseUrl);
  const productionDb = dbHost !== null && PRODUCTION_HOSTS.has(dbHost);
  const localServer = host !== null && LOOPBACK.test(host);

  if (dbHost !== null && !productionDb && /\.supabase\.co$/.test(dbHost)) {
    // A non-production Supabase project behind this app is the nightly clone
    // (or a branch): the data is a copy, whatever the slot is called.
    return { kind: "clone", label: "Clone", host };
  }
  if (localServer) return { kind: "local", label: "Local", host };
  if (productionDb && input.activeServer === "production") {
    return { kind: "production", label: "Production", host };
  }
  return { kind: "other", label: input.activeServer, host };
}
