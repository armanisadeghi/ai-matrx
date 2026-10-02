// lib/scoped-config/effectiveKnobs.server.ts — the server twin of `useEffectiveKnob`.
//
// A Server Component that must draw the RIGHT page on the first byte (not draw one page and swap to
// another when the browser's knob read lands) reads the person's resolved knob here: the same ONE door
// the browser uses (`platform.knob_snapshot`), answered for the signed-in person from their session
// cookie. The browser's device rung is not known on the server, so a device-level override still
// arrives with the client read, which wins once it answers.
//
// Never throws: a read that fails answers `undefined` ("not answered"), exactly what the client hook
// answers before its read lands, and says so in the server log with the remedy.

import "server-only";

import { createClient } from "@/utils/supabase/server";

/** The register's own (feature, key) pair, as `{ feature, key }`; the browser module is not imported here. */
export async function readEffectiveKnobOnServer(address: { feature: string; key: string }): Promise<unknown> {
  const { feature, key } = address;
  try {
    const supabase = await createClient();
    const { data, error } = await (
      supabase.schema("platform") as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("knob_snapshot", { p_organization_id: null });
    if (error) {
      console.error(`[knob] server read of ${feature}.${key} failed (${error.message}); the page falls back to the browser's read.`);
      return undefined;
    }
    const resolved = ((data ?? {}) as { resolved?: Record<string, unknown> }).resolved ?? {};
    return resolved[`${feature}.${key}`];
  } catch (error) {
    console.error(`[knob] server read of ${feature}.${key} threw; the page falls back to the browser's read.`, error);
    return undefined;
  }
}
