"use client";

// The records mount for one organization's 360 reviews, plus the server step that makes the
// organization's copies Confidential (aidream POST /typed-tables/confidential).

import type { ReactNode } from "react";
import { RecordsProvider } from "@ai-matrx/records/react";

import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useBackendApi } from "@/hooks/useBackendApi";

import type { ConfidentialServerStep } from "./service";

export function Review360Host({ organizationId, children }: { organizationId: string; children: ReactNode }) {
  const config = useAppRecordsConfig(organizationId);
  return <RecordsProvider config={config}>{children}</RecordsProvider>;
}

export function useConfidentialServerStep(): ConfidentialServerStep {
  const api = useBackendApi();
  return async (body) => {
    const res: unknown = await api.post("/typed-tables/confidential", body);
    if (res instanceof Response && !res.ok) {
      const detail: unknown = await res.json().catch(() => null);
      const said =
        detail && typeof detail === "object" && typeof (detail as { detail?: unknown }).detail === "string"
          ? (detail as { detail: string }).detail
          : `the server answered ${res.status}`;
      throw new Error(said);
    }
  };
}
