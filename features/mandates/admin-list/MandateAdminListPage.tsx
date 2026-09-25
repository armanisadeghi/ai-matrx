"use client";

// features/mandates/admin-list/MandateAdminListPage.tsx
//
// /administration/mandates/list-preview — the NEW admin mandate list, built
// beside the old console (features/mandates/admin/MandatesConsole.tsx, left
// untouched) on the canonical `EntityListPage`. One top row: Mine / Org /
// System on the left, New mandate on the right; the table's own title row
// carries search, saved views and the column picker. The whole query lives in
// the URL, so Back restores scope, search, filters and sort.

import { useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListService } from "@/lib/entity-list/config";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import {
  rungIdentityOf,
  type ImpactVerdict,
} from "@/features/mandates/admin/impact";
import { useImpactAdvance } from "@/features/mandates/admin/impact-advance";
import { adminMandateListConfig } from "./listConfig";
import {
  MandateAdminListActionsContext,
  useMandateAdminListState,
} from "./context";
import { ensureMandateAdminList, invalidateMandateAdminList } from "./store";
import { countsOf, facetsOf, pageOf, type MandateAdminViewer } from "./service";
import type { MandateAdminRow } from "./types";

/** What each secondary read feeds, in the words of the columns it fills. */
const SOURCE_LABEL: Record<string, string> = {
  codeTruth: "Code declarations",
  coverage: "Coverage",
  catalogue: "Goals",
  serves: "Serves",
  impact: "Grades",
  inputs: "Inputs",
};

function organizationNamesOf(rows: MandateAdminRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.organizationId && !row.isSystem) out[row.organizationId] = row.homeLabel;
  }
  return out;
}

export function MandateAdminListPage() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const authReady = useAppSelector(selectAuthReady);
  const organizationId = useAppSelector(selectOrganizationId);
  const { organizationState } = useOrganizationRequired();
  const listState = useMandateAdminListState();

  // Any mandate write anywhere (the Enabled switch included) reloads the list.
  useEffect(() => onMandateCacheInvalidated(() => invalidateMandateAdminList()), []);

  const verdictByRung = new Map<string, ImpactVerdict>();
  for (const row of listState.rows) {
    for (const verdict of [row.defaultVerdict, ...row.bindingVerdicts]) {
      if (verdict) verdictByRung.set(rungIdentityOf(verdict.apply_token), verdict);
    }
  }
  const writes = useImpactAdvance({
    verdictByRung,
    onWritten: () => invalidateMandateAdminList(),
  });

  const ready = authReady && Boolean(accessToken) && Boolean(organizationId);
  const viewer: MandateAdminViewer = { userId };
  const load = () => ensureMandateAdminList(dispatch);
  const service: EntityListService<MandateAdminRow> = {
    fetchPage: async (query, sort) => pageOf(await load(), query, viewer, sort),
    fetchCounts: async (query) => {
      const rows = await load();
      return countsOf(rows, query, viewer, organizationNamesOf(rows));
    },
    fetchFacets: async (query) => facetsOf(await load(), query, viewer),
  };

  if (!ready) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        {organizationState === "required" || organizationState === "unavailable" ? (
          <OrganizationContextNotice state={organizationState} compact />
        ) : (
          <div className="space-y-2" aria-busy="true" aria-label="Loading mandates">
            <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
            <div className="h-64 w-full animate-pulse rounded-md bg-muted/60" />
          </div>
        )}
      </div>
    );
  }

  return (
    <MandateAdminListActionsContext.Provider
      value={{
        advancing: writes.busy !== null,
        advanceAnyway: (verdict) => void writes.advance([verdict], `List: ${verdict.mandate_key}`),
      }}
    >
      <EntityListPage
        config={{
          ...adminMandateListConfig,
          service,
          serviceKey: `${userId ?? ""}:${listState.version}`,
        }}
        defaultScope={{ kind: "system" }}
        clearsShellHeader={false}
        notice={
          Object.keys(listState.failures).length > 0 ? (
            <div
              role="status"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300"
            >
              {Object.entries(listState.failures)
                .map(([source, message]) => `${SOURCE_LABEL[source] ?? source} unavailable: ${message}`)
                .join(" · ")}
            </div>
          ) : null
        }
        headerActions={
          <Button asChild size="sm" className="h-8 gap-1">
            <Link href="/administration/mandates/new">
              <Plus className="h-3.5 w-3.5" />
              New mandate
            </Link>
          </Button>
        }
      />
    </MandateAdminListActionsContext.Provider>
  );
}
