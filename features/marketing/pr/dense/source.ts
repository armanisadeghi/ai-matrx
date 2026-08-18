/**
 * The Press Room data seam.
 *
 * ONE function stands between the console and its rows. Today it resolves
 * fixtures (see `fixtures.ts` for why that is sanctioned here); tomorrow it
 * resolves three Supabase reads. Nothing else in the feature changes, because
 * nothing else in the feature knows where a row came from — every component is
 * a pure function of generated row types.
 *
 * The Supabase replacement, written out so it is a substitution and not a
 * design exercise:
 *
 *   const supabase = createClient();
 *   const [angles, requests, coverage] = await Promise.all([
 *     supabase.schema("seo").from("story_angle")
 *       .select("*").eq("site_id", siteId).is("deleted_at", null)
 *       .order("priority", { ascending: false }),
 *     supabase.schema("seo").from("source_request")
 *       .select("*").eq("site_id", siteId).is("deleted_at", null)
 *       .order("deadline_at", { ascending: true, nullsFirst: false }),
 *     supabase.schema("seo").from("coverage_mention")
 *       .select("*").eq("site_id", siteId)
 *       .order("published_at", { ascending: false }),
 *   ]);
 *
 * The DB goes direct from the client (workspace CLAUDE.md rule 1) — this never
 * becomes a call to the Python server.
 */

import { buildFixtureBundle, type PressRoomBundle } from "./fixtures";

/**
 * Scenario override, read from `?state=` on the URL.
 *
 * This exists so the unglamorous states are REACHABLE and reviewable rather
 * than written and never seen — ground-rules §3. It only ever degrades the
 * result; it can never invent data.
 */
export type PressRoomScenario = "live" | "empty" | "error" | "slow";

export function parseScenario(value: string | null): PressRoomScenario {
  return value === "empty" || value === "error" || value === "slow"
    ? value
    : "live";
}

export class PressRoomLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PressRoomLoadError";
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function loadPressRoom(
  scenario: PressRoomScenario,
  signal?: AbortSignal,
): Promise<PressRoomBundle> {
  if (scenario === "error") {
    await delay(250, signal);
    throw new PressRoomLoadError(
      "permission denied for schema seo (row-level security blocked this read)",
    );
  }

  // A deliberately long read, so the stall notice on the console is something
  // that has actually been watched rather than something that was coded.
  await delay(scenario === "slow" ? 14_000 : 320, signal);

  const bundle = buildFixtureBundle();
  if (scenario === "empty") {
    return { ...bundle, angles: [], requests: [], coverage: [] };
  }
  return bundle;
}
