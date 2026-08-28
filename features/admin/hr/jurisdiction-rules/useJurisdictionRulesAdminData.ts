// features/admin/hr/jurisdiction-rules/useJurisdictionRulesAdminData.ts
//
// One fetch per page against the superadmin read door. Local state only — HR
// keeps no Redux slice, and this data is a per-page snapshot of the rule
// library, not global app state.

"use client";

import { useCallback, useEffect, useState } from "react";

import { loadJurisdictionRulesAdminData } from "./service";
import type { JurisdictionAdminLoad } from "./types";

export interface JurisdictionAdminDataState {
  load: JurisdictionAdminLoad | null;
  loading: boolean;
  reload: () => void;
}

export function useJurisdictionRulesAdminData(): JurisdictionAdminDataState {
  const [load, setLoad] = useState<JurisdictionAdminLoad | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    const next = await loadJurisdictionRulesAdminData();
    setLoad(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return { load, loading, reload: () => void run() };
}
