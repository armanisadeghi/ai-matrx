/**
 * The Press Room's calls into aidream.
 *
 * Generating angles is an AGENT RUN, not a data read, so it goes to the Python
 * brain — the one case where this surface does not talk to Supabase directly.
 * Rulings are row writes and stay on the direct client path (`data.ts`).
 *
 * Uses the canonical `lib/python-client` rather than a bespoke fetch wrapper:
 * it already resolves the base URL from the active server, attaches the
 * Supabase bearer token, and stamps a request id.
 */

import { postJson } from "@/lib/python-client";

/** One rejected angle and why. The surface shows these — never a silent thin. */
export interface AngleGate {
  angle_key: string;
  kept: boolean;
  downgraded: boolean;
  reasons: string[];
}

export interface GenerateAnglesResult {
  kept: number;
  dropped: number;
  gates: AngleGate[];
  bundle_stats: {
    fact_count?: number;
    confirmed_fact_count?: number;
    asset_count?: number;
    coverage_count?: number;
    pages_captured?: number;
    pages_failed?: number;
  };
  coverage_assessment: {
    endowments_covered?: string[];
    endowments_absent?: string[];
    evidence_strength?: number;
    notes?: string;
  };
  limitations: string[];
}

export interface GenerateAnglesOptions {
  maxAngles?: number;
  /** Pages of the site's own content to fetch as evidence. */
  capturePages?: number;
  signal?: AbortSignal;
}

/**
 * Analyse a site and persist whatever survives the gates.
 *
 * This is slow by nature — it fetches the site's own pages, then runs the
 * mandated analyst over them. Callers should show real progress, not a spinner
 * that lies about how long it takes.
 */
export async function generateStoryAngles(
  siteId: string,
  options: GenerateAnglesOptions = {},
): Promise<GenerateAnglesResult> {
  const { data } = await postJson<GenerateAnglesResult>(
    `/seo/sites/${encodeURIComponent(siteId)}/press/angles/generate`,
    {
      max_angles: options.maxAngles ?? 12,
      capture_pages: options.capturePages ?? 8,
    },
    { signal: options.signal },
  );
  return data;
}
