// features/education/compliance/coppaService.ts
//
// Client service for the COPPA age gate. Thin, typed wrappers over the
// `edu_coppa_gate` / `edu_set_age_band` SECURITY DEFINER RPCs — reads go DIRECT
// via supabase-js (the RPCs resolve identity from auth.uid() and read the
// RLS-guarded guardian_link server-side). Never throws — returns StudyResult<T>.

"use client";

import { supabase } from "@/utils/supabase/client";
import { fail } from "@/features/education/study/service/serviceError";
import type { StudyResult } from "@/features/education/study/types";
import { mapCoppaGate, type AgeBand, type CoppaGate, type CoppaGateRow } from "./types";

export const coppaService = {
  /** The authoritative AI/data gate for the current user. */
  async getGate(): Promise<StudyResult<CoppaGate>> {
    try {
      const { data, error } = await supabase.rpc("edu_coppa_gate");
      if (error) return fail("coppa.getGate", error);
      return { data: mapCoppaGate(data as unknown as CoppaGateRow), error: null };
    } catch (e) {
      return fail("coppa.getGate", e);
    }
  },

  /** Set the caller's own age band (validated server-side to the allowed set). */
  async setAgeBand(band: AgeBand): Promise<StudyResult<AgeBand>> {
    try {
      const { data, error } = await supabase.rpc("edu_set_age_band", {
        p_band: band,
      });
      if (error) return fail("coppa.setAgeBand", error);
      return { data: (data as AgeBand) ?? band, error: null };
    } catch (e) {
      return fail("coppa.setAgeBand", e);
    }
  },
};
