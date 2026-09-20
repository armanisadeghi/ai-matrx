"use client";

// Component identities only: all table state, rows, filters, copy orchestration,
// and row-window contents belong to the design-system package. No startup IO.
// Table UI feedback: /Users/armanisadeghi/code/common-docs/projects/npm-package-extraction/TABLE-UI-ISSUES.md
// Read and update that checklist before fixing table UI feedback in any host.
import { JsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MatrxDataTableProvider, type MatrxDataTableHost as TableHost, type TableWindowPanelProps } from "@ai-matrx/design-system/data-table/host";
import type { MatrxDataTableDensity } from "@ai-matrx/design-system/data-table/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { TableSavedViews } from "./TableSavedViews";
import { TableToolbarAction } from "./TableToolbarAction";
import { createDefaultTableRowMenuDescriptor, registerTableRowContextResolver } from "@/features/context-menu-v3/table-row-context-registry";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useIsInsideContextMenu } from "@/features/context-menu-v3/menu-presence";

export type TableDensity = MatrxDataTableDensity;
export const TABLE_DENSITY_KNOB_KEY = "tables.density.mode";

/** The register is authoritative; an unresolved or malformed answer stays normal. */
export function tableDensityFromKnob(value: unknown): TableDensity {
  return value === "condensed" || value === "spacious" || value === "normal"
    ? value
    : "normal";
}

const WindowPanel = dynamic(() => import("@/features/window-panels/WindowPanel").then((module) => module.WindowPanel), { ssr: false });

// The sole Next dynamic front door for package-owned row windows. Its callers
// preserve the existing open-on-demand behavior without reintroducing a host implementation.
export const DataRowWindow = dynamic(
  () =>
    import("@ai-matrx/design-system/data-table/data-row-window").then(
      (module) => module.DataRowWindow,
    ),
  { ssr: false, loading: () => null },
);
export type {
  DataRowWindowProps,
  DataRowWindowTab,
} from "@ai-matrx/design-system/data-table/data-row-window";
function TableWindowPanel(props: TableWindowPanelProps) {
  return <WindowPanel {...props} />;
}
function TableContextMenuBoundary({ label, children }: { label: string; children: ReactNode }) {
  const insideMenu = useIsInsideContextMenu();
  if (insideMenu) return <>{children}</>;
  return <NonEditableContextMenu sourceFeature="system" contextData={{ content: label }} enableFloatingIcon={false}><div className="contents">{children}</div></NonEditableContextMenu>;
}
const ports: TableHost = {
  JsonViewer,
  Link,
  CopyControls: CopyButtons,
  ToolbarAction: TableToolbarAction,
  SavedViews: TableSavedViews,
  EntityRef,
  SidePanelSurface,
  WindowPanel: TableWindowPanel,
  ResourcePeek: ResourcePeekHost,
  resolveEntityDoors: (token, id, href) => {
    const doors = resolveEntityDoors(token, id, href);
    return { ...(doors.href === null ? {} : { href: doors.href }), peekKind: doors.peekKind, canPeek: doors.canPeek };
  },
  notify: toast,
  rowContextRegistry: { register: registerTableRowContextResolver },
  createDefaultMenuContext: createDefaultTableRowMenuDescriptor,
  ContextMenuBoundary: TableContextMenuBoundary,
};
export function MatrxDataTableHost({ children }: { children: ReactNode }) {
  const organizationId = useAppSelector(selectOrganizationId);
  const userId = useAppSelector(selectUserId);
  const defaultDensity = tableDensityFromKnob(
    useEffectiveKnob(organizationId, userId, TABLE_DENSITY_KNOB_KEY),
  );
  const densityPorts: TableHost = {
    ...ports,
    defaultDensity,
  };
  return <MatrxDataTableProvider value={densityPorts}>{children}</MatrxDataTableProvider>;
}
