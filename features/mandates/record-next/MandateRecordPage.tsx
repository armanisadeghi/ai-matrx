"use client";

// features/mandates/record-next/MandateRecordPage.tsx
//
// THE NEW MANDATE RECORD PAGE — /administration/mandates/record-preview/<key>.
// Built beside /administration/mandates/<key> (AdminMandateWorkspacePage, left
// untouched) per common-docs/systems/intelligence/mandates/UI-REGISTER.md.
//
// Shape: the agents-style record header (EntityModeHeader — back | name |
// actions), the name shown ONCE, the existing tabs with short labels (./record-tabs.ts), and the selected tab in the URL
// (`?tab=`) so refresh, deep links and browser Back all work. The tabs sit in
// their own row under the header (`RecordTabStrip`), every tab NAMED on one
// row at desktop widths; only a narrow screen moves the ones that do not fit
// into a "More" menu, which lists them by name. (They used to ride in the
// header's mode pill, which shares the bar with the name and the actions and
// collapsed eleven tabs to a single "Definition" pill at 1440px.)

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, Trash2, Workflow } from "lucide-react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { pushAppHref } from "@/lib/deployment/navigate";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { softDeleteMandate } from "@/features/mandates/admin/service";
import { PromoteToSystemMandateButton } from "@/features/mandates/admin/mandate-actions";
import { useStartMandateWorkflow } from "@/features/mandates/useStartMandateWorkflow";
import {
  SurfaceRuntimeProvider,
  getRegisteredSurfaceScopeContributions,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MANDATE_WORKSPACE_SURFACE_NAME,
  createMandateWorkspaceScope,
} from "@/features/surfaces/manifests/mandate-workspace.manifest";
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import { MandateRecordBody } from "./MandateRecordBody";
import { RecordTabStrip } from "./RecordTabStrip";
import {
  DEFAULT_RECORD_TAB,
  MANDATE_LIST_PREVIEW_HREF,
  parseRecordTabFrom,
  recordTabsForLevel,
  tabRowOf,
  type RecordLevel,
  type RecordTabId,
} from "./record-tabs";
import { useRecordBackHref } from "./useRecordBackHref";
import { useRecordTitle } from "@/lib/record-title/record-title";
import { MandateVisibilityControl } from "./MandateVisibilityControl";

/**
 * Which seat opens the record. `system` (the default) is the admin route,
 * unchanged. `person` is /mandates/record-preview/<key>; `organization` is
 * /organizations/<org>/mandates/<key> — same page, same body, the level only
 * decides the tabs, the principal, and which header actions exist.
 */
export interface MandateRecordPageProps {
  mandateKey: string;
  level?: RecordLevel;
  /** Organization level: the route's organization id. */
  orgId?: string | null;
  /** Organization level: the viewer is an owner/admin of `orgId`. */
  canManageOrg?: boolean;
  /** Where Back goes when the tab did not come from a list. */
  listHref?: string;
}

export function MandateRecordPage(props: MandateRecordPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <SuspenseLoader />
        </div>
      }
    >
      <MandateRecordPageInner {...props} />
    </Suspense>
  );
}

function MandateRecordPageInner({
  mandateKey,
  level = "system",
  orgId = null,
  canManageOrg = false,
  listHref = MANDATE_LIST_PREVIEW_HREF,
}: MandateRecordPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readOnly = level === "organization" && !canManageOrg;
  const tabs = recordTabsForLevel(level, { readOnly });
  const activeTab = parseRecordTabFrom(searchParams.get("tab"), tabs);
  const backHref = useRecordBackHref(listHref);

  const hrefFor = (tab: RecordTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_RECORD_TAB) params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  // A tab change is a push: browser Back steps back through tabs, while the
  // header's Back (useRecordBackHref) skips them and leaves the record.
  const onTabChange = (tab: RecordTabId) =>
    router.push(hrefFor(tab), { scroll: false });

  return (
    <SurfaceRuntimeProvider
      surfaceName={MANDATE_WORKSPACE_SURFACE_NAME}
      getScope={() => ({
        ...createMandateWorkspaceScope({
          mandate_key: mandateKey,
          selection: window.getSelection()?.toString() || undefined,
        }),
        ...getRegisteredSurfaceScopeContributions(MANDATE_WORKSPACE_SURFACE_NAME),
      })}
    >
      <div className="h-full overflow-y-auto pb-safe">
        {/* Under /administration the content already starts below the
            header; a (core) member page sits under the glass shell header and
            clears it, exactly as EntityListPage's clearsShellHeader does. */}
        <div
          className={
            level === "system"
              ? "mx-auto w-full max-w-6xl px-4 pb-10 pt-3 sm:px-6"
              : "mx-auto w-full max-w-6xl px-4 pb-10 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6"
          }
        >
          <MandateRecordBody
            mandateKeyOrId={mandateKey}
            host={level === "system" ? "admin-route" : "route"}
            principal={
              level === "organization" && orgId
                ? { kind: "org", orgId }
                : { kind: "user" }
            }
            tabs={tabs}
            showAdminPanels={level === "system" ? undefined : false}
            readOnly={readOnly}
            activeTab={activeTab}
            onTabChange={onTabChange}
            listHref={listHref}
            renderChrome={({ name, data, exportMenu, refresh }) => (
              <>
                <RecordHeader
                  name={name}
                  data={data}
                  exportMenu={exportMenu}
                  refresh={refresh}
                  backHref={backHref}
                  level={level}
                  orgId={orgId}
                  canManageOrg={canManageOrg}
                  listHref={listHref}
                  readOnly={readOnly}
                  canCreateAgent={tabs.some((tab) => tab.id === "create-agent")}
                  onTabChange={onTabChange}
                />
                {/* The admin route is super-admin gated by its layout, so
                    every tab shows there; a member page shows only the tabs
                    its seat may use (record-tabs.ts `recordTabsForLevel`). */}
                <RecordTabStrip
                  tabs={tabRowOf(tabs)}
                  value={activeTab}
                  onChange={onTabChange}
                  className="mb-3"
                />
              </>
            )}
          />
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}

/**
 * May this seat remove the mandate? The admin route always could; a person
 * only their own soft mandate; an organization's manager only that
 * organization's own soft mandate. Pure — exported for tests.
 */
export function recordCanRemove(
  mandate: Pick<MandateWorkspaceData["mandate"], "organization_id" | "created_by" | "origin">,
  seat: { level: RecordLevel; userId: string | null; orgId: string | null; canManageOrg: boolean },
): boolean {
  if (seat.level === "system") return true;
  if (mandate.origin === "code") return false;
  if ((mandate.organization_id ?? "").toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()) {
    return false;
  }
  if (seat.level === "person") return Boolean(seat.userId) && mandate.created_by === seat.userId;
  return seat.canManageOrg && Boolean(seat.orgId) && mandate.organization_id === seat.orgId;
}

function RecordHeader({
  name,
  data,
  exportMenu,
  refresh,
  backHref,
  level,
  orgId,
  canManageOrg,
  listHref,
  readOnly,
  canCreateAgent,
  onTabChange,
}: {
  name: string;
  data: MandateWorkspaceData;
  exportMenu: React.ReactNode;
  refresh: () => void;
  backHref: string;
  level: RecordLevel;
  orgId: string | null;
  canManageOrg: boolean;
  listHref: string;
  readOnly: boolean;
  /** The seat may open the protected "Create Agent" body (a header action). */
  canCreateAgent: boolean;
  onTabChange: (tab: RecordTabId) => void;
}) {
  const router = useRouter();
  // The browser tab and the admin breadcrumb say the mandate's name, never
  // "Mandate" or its key.
  useRecordTitle(name);
  const { starting, startWorkflow } = useStartMandateWorkflow();
  const userId = useAppSelector(selectUserId);
  const [removing, setRemoving] = useState(false);
  const canRemove = recordCanRemove(data.mandate, { level, userId, orgId, canManageOrg });
  // Sharing is the creator's call, on their own soft mandate (person seat).
  const canShare =
    level === "person" &&
    data.mandate.origin !== "code" &&
    Boolean(userId) &&
    data.mandate.created_by === userId;

  // The consequence first, then the soft removal — the same service call and
  // the same words as the original page's Remove control.
  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description:
        "This mandate will disappear from pickers and stop resolving. " +
        "Anything bound to it — every rung's Mandate Holder and mapping — stops applying with it. " +
        "This is a soft removal: the record and its history are kept, so an admin can restore it if this was a mistake.",
      confirmLabel: "Remove it",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await softDeleteMandate(data.mandate.id);
      toast.success("Mandate removed.");
      pushAppHref(router, listHref);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "That mandate was not removed.",
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <EntityModeHeader
      backHref={backHref}
      entityLabel={name}
      right={
        <div className="flex items-center gap-1">
          {canShare ? (
            <MandateVisibilityControl mandate={data.mandate} onChanged={refresh} />
          ) : null}
          {exportMenu}
          {level === "system" &&
          data.mandate.organization_id !== SYSTEM_ORGANIZATION_ID ? (
            <PromoteToSystemMandateButton
              mandate={data.mandate}
              onPromoted={refresh}
            />
          ) : null}
        </div>
      }
      actions={[
        // Workflow parity: a job is filled by an agent OR a workflow — both
        // start here. "New agent" opens the protected Create Agent body; a
        // workflow starts here — pre-wired with this
        // job's inputs and output kind, opened in the studio — and is then
        // picked on the Binding tab once it has steps.
        ...(canCreateAgent && !readOnly
          ? [
              {
                label: "New agent",
                icon: Bot,
                onPress: () => onTabChange("create-agent"),
              },
            ]
          : []),
        ...(readOnly
          ? []
          : [
              {
                label: starting ? "Starting workflow…" : "New workflow",
                icon: Workflow,
                disabled: starting,
                onPress: () =>
                  void startWorkflow(data.mandate.mandate_key).then((created) => {
                    if (created) onTabChange("holder");
                  }),
              },
            ]),
        ...(canRemove
          ? [
              {
                label: removing ? "Removing…" : "Remove",
                icon: Trash2,
                destructive: true,
                disabled: removing,
                onPress: () => void remove(),
              },
            ]
          : []),
      ]}
    />
  );
}
