// features/administration/final-switch/finalSwitchState.server.ts — the final switch's state, read on
// the server so an old route lands on its new page BEFORE it renders (lane FINAL-SWITCH).
//
// `platform.final_switch_state()` answers { state, data_screen, scopes_screens, at, by }. The old
// routes that the final switch turns over (the /data list, the older list managers /lists/v1 and
// /lists/v2) ask here and redirect when their piece is on the new system. While the switch is off
// they render exactly as before. A read that fails leaves the old page up (never a dead end): the
// old page still works and answers every moved table with its pointer.

import "server-only";

import { createClient } from "@/utils/supabase/server";

export type FinalSwitchState = {
  state: "old" | "new";
  data_screen: "old" | "new";
  scopes_screens: "old" | "new";
  at: string | null;
  by: string | null;
};

export async function readFinalSwitchState(): Promise<FinalSwitchState | null> {
  try {
    const client = await createClient();
    const platform = client.schema("platform" as never) as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await platform.rpc("final_switch_state", {});
    if (error || !data || typeof data !== "object") {
      if (error) console.warn(`[final-switch] the state could not be read; the old page stays up: ${error.message}`);
      return null;
    }
    return data as FinalSwitchState;
  } catch (e) {
    console.warn(`[final-switch] the state could not be read; the old page stays up: ${(e as Error).message}`);
    return null;
  }
}
