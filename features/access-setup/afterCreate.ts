"use client";

// THE one client helper that opens People involved at the moment of creation (access-setup PLAN
// §5b). A creating door returns `access_setup: {head_type, ids|cycle_id, needs_confirm}`; this is the
// only caller that turns it into a window. Access is already correct before it opens, so a creation
// whose organization already confirmed the type (needs_confirm false) opens nothing.

import { useOpenAccessSetupWindow } from "@/features/overlays/openers/accessSetupWindow";

import { parseAfterCreate } from "./types";

export function useAfterCreateOpenAccessSetup() {
  const open = useOpenAccessSetupWindow();
  /** Returns true when the panel opened. `response` is the door's `access_setup` block (raw). */
  return function afterCreateOpenAccessSetup(response: unknown, recordName?: string | null): boolean {
    const setup = parseAfterCreate(response);
    if (!setup || !setup.needsConfirm) return false;
    if (setup.cycleId) open({ headType: setup.headType, cycleId: setup.cycleId });
    else open({ headType: setup.headType, recordId: setup.ids[0], recordName: recordName ?? null });
    return true;
  };
}
