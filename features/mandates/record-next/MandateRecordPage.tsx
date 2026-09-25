"use client";

// features/mandates/record-next/MandateRecordPage.tsx
//
// THE NEW MANDATE RECORD PAGE — /administration/mandates/record-preview/<key>.
// Built beside /administration/mandates/<key> (AdminMandateWorkspacePage, left
// untouched) per common-docs/systems/mandates/UI-REGISTER.md.
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
import { Trash2 } from "lucide-react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { pushAppHref } from "@/lib/deployment/navigate";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { softDeleteMandate } from "@/features/mandates/admin/service";
import { PromoteToSystemMandateButton } from "@/features/mandates/admin/mandate-actions";
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
  parseRecordTab,
  visibleRecordTabs,
  type RecordTabId,
} from "./record-tabs";
import { useRecordBackHref } from "./useRecordBackHref";

export function MandateRecordPage({ mandateKey }: { mandateKey: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <SuspenseLoader />
        </div>
      }
    >
      <MandateRecordPageInner mandateKey={mandateKey} />
    </Suspense>
  );
}

function MandateRecordPageInner({ mandateKey }: { mandateKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = parseRecordTab(searchParams.get("tab"), true);
  const backHref = useRecordBackHref(MANDATE_LIST_PREVIEW_HREF);

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
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-3 sm:px-6">
          <MandateRecordBody
            mandateKeyOrId={mandateKey}
            host="admin-route"
            activeTab={activeTab}
            onTabChange={onTabChange}
            listHref={MANDATE_LIST_PREVIEW_HREF}
            renderChrome={({ name, data, exportMenu, refresh }) => (
              <>
                <RecordHeader
                  name={name}
                  data={data}
                  exportMenu={exportMenu}
                  refresh={refresh}
                  backHref={backHref}
                />
                {/* The admin route is super-admin gated by its layout, so
                    every tab shows. */}
                <RecordTabStrip
                  tabs={visibleRecordTabs(true)}
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

function RecordHeader({
  name,
  data,
  exportMenu,
  refresh,
  backHref,
}: {
  name: string;
  data: MandateWorkspaceData;
  exportMenu: React.ReactNode;
  refresh: () => void;
  backHref: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  // The consequence first, then the soft removal — the same service call and
  // the same words as the original page's Remove control.
  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description:
        "This mandate will disappear from pickers and stop resolving. " +
        "Anything bound to it — every rung's holder and mapping — stops applying with it. " +
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
      pushAppHref(router, MANDATE_LIST_PREVIEW_HREF);
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
          {exportMenu}
          {data.mandate.organization_id !== SYSTEM_ORGANIZATION_ID ? (
            <PromoteToSystemMandateButton
              mandate={data.mandate}
              onPromoted={refresh}
            />
          ) : null}
        </div>
      }
      actions={[
        {
          label: removing ? "Removing…" : "Remove",
          icon: Trash2,
          destructive: true,
          disabled: removing,
          onPress: () => void remove(),
        },
      ]}
    />
  );
}
