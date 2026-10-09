"use client";

// Component identities only: all table state, rows, filters, copy orchestration,
// and row-window contents belong to the design-system package. No startup IO.
// Table UI feedback: /Users/armanisadeghi/code/common-docs/projects/npm-package-extraction/TABLE-UI-ISSUES.md
// Read and update that checklist before fixing table UI feedback in any host.
import { JsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MatrxDataTableProvider, type MatrxDataTableHost as TableHost, type TableContextMenuBoundaryProps, type TableDoors, type TableMenuIconProps, type TableWindowPanelProps } from "@ai-matrx/design-system/data-table/host";
import { readMenuTarget } from "@ai-matrx/design-system/data-table/menu-targets";
import type { MatrxDataTableDensity } from "@ai-matrx/design-system/data-table/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import { hostEntityMenu } from "@/features/admin/users/components/admin-user-table-menu";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { CanvasPagePanel } from "@/features/canvas/host/pagePanel";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { TableSavedViews } from "./TableSavedViews";
import { TableToolbarAction } from "./TableToolbarAction";
import { createDefaultTableRowMenuDescriptor, registerTableRowContextResolver } from "@/features/context-menu-v3/table-row-item";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useIsInsideContextMenu } from "@/features/context-menu-v3/menu-presence";
import { TABLE_MENU_ICONS, toContextMenuExtraSections } from "./table-menu-sections";
import { ReadFailure } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { useTableCustomFieldColumns } from "@/features/unified-data/standard-field-columns/useTableCustomFieldColumns";

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
// The table's neutral sections (`contextMenu.sections`) are asked per open with
// the level read off the clicked element, and drawn beside the row's own
// descriptor sections. A table that declares none passes no `sections`, and
// this boundary is exactly what it was.
function TableContextMenuBoundary({ label, children, sections }: TableContextMenuBoundaryProps) {
  const insideMenu = useIsInsideContextMenu();
  const resolveSections = useCallback(
    (target: HTMLElement | null) => {
      if (!sections) return undefined;
      const aimed = readMenuTarget(target);
      if (!aimed) return undefined;
      const answered = toContextMenuExtraSections(sections(aimed));
      return answered.length > 0 ? answered : undefined;
    },
    [sections],
  );
  if (insideMenu) return <>{children}</>;
  // The heading is what was right-clicked, in the words on screen: a column heading's name
  // ("Content: Route tag"), never the table's id or "Data table". A row or cell is headed by the
  // row registry (its cell's words); anywhere else keeps the table's label.
  return <NonEditableContextMenu sourceFeature="system" contextData={{ content: label }} resolveContextOnOpen={headingWords} {...(sections ? { resolveExtraSectionsOnOpen: resolveSections } : {})}><div className="contents">{children}</div></NonEditableContextMenu>;
}
function headingWords(target: HTMLElement | null) {
  const heading = target?.closest<HTMLElement>("th, [role='columnheader']");
  if (!heading) return null;
  const copy = heading.cloneNode(true) as HTMLElement;
  // Controls and marks carry their own labels (sort, options, resize, the fx mark); the name does not.
  copy.querySelectorAll("[aria-label], [aria-hidden='true'], [role='separator']").forEach((node) => node.remove());
  const words = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  return words ? { content: words } : null;
}
function TableMenuIcon({ name, className }: TableMenuIconProps) {
  const Icon = TABLE_MENU_ICONS[name];
  return Icon ? <Icon className={className} aria-hidden /> : null;
}
/**
 * RC-B12 round 13: a table handed `read` draws a failed read through the SAME
 * views every other list uses — ReadFailure (the error with the Alchemy Menu
 * and a retry) when there are no rows, StaleDataNotice over kept rows.
 * Props mirror the package's TableReadFailureProps / TableStaleNoticeProps.
 */
interface TableReadViewProps {
  error: unknown;
  what: string;
  onRetry?: (() => void) | undefined;
}
function TableReadFailure({ error, what, onRetry }: TableReadViewProps) {
  return <ReadFailure error={error} what={what} className="mx-auto w-full max-w-md text-left" {...(onRetry ? { onRetry } : {})} />;
}
function TableStaleNotice({ error, what, onRetry }: TableReadViewProps) {
  // No retry to offer: say the read failed above the kept rows, without a dead button.
  if (!onRetry) return <ReadFailure error={error} what={what} className="m-0 shrink-0" />;
  return <StaleDataNotice hasData what={what} onRetry={onRetry} className="shrink-0" />;
}
// Spread in, so the ports also compile against a package without them (they are ignored there).
const readPorts = { ReadFailure: TableReadFailure, StaleNotice: TableStaleNotice };
function tableEntityDoors(token: string, id: string, href?: string | null): TableDoors {
  const doors = resolveEntityDoors(token, id, href);
  return { ...(doors.href === null ? {} : { href: doors.href }), peekKind: doors.peekKind, canPeek: doors.canPeek };
}
const ports: TableHost = {
  ...readPorts,
  JsonViewer,
  Link,
  CopyControls: CopyButtons,
  ToolbarAction: TableToolbarAction,
  SavedViews: TableSavedViews,
  EntityRef,
  // A row's detail is a canvas tab: the right-hand region is the canvas, never a second panel.
  SidePanelSurface: CanvasPagePanel,
  WindowPanel: TableWindowPanel,
  ResourcePeek: ResourcePeekHost,
  resolveEntityDoors: tableEntityDoors,
  notify: toast,
  rowContextRegistry: { register: registerTableRowContextResolver },
  createDefaultMenuContext: createDefaultTableRowMenuDescriptor,
  ContextMenuBoundary: TableContextMenuBoundary,
  MenuIcon: TableMenuIcon,
  // Lane 7 W5 — every table that names its rows' registry token (`rowToken`) gets that token's
  // custom-field columns, for the organizations its rows belong to.
  useCustomFieldColumns: useHostTableCustomFieldColumns,
};

// THE FIRST TABLE ASKS FOR THE DENSITY KNOB. The host wraps every page, so resolving its density
// knob in the provider was a startup read on pages with no table at all. Every MatrxDataTable calls
// the `useCustomFieldColumns` port unconditionally, so that port is the "a table mounted" signal.
let tableMounted = false;
const tableMountListeners = new Set<() => void>();
function subscribeTableMounted(listener: () => void): () => void {
  tableMountListeners.add(listener);
  return () => tableMountListeners.delete(listener);
}
function markTableMounted(): void {
  if (tableMounted) return;
  tableMounted = true;
  for (const listener of tableMountListeners) listener();
}
function useHostTableCustomFieldColumns<T>(token: string | null, organizationIds: readonly string[]) {
  useEffect(markTableMounted, []);
  return useTableCustomFieldColumns<T>(token, organizationIds);
}
export function MatrxDataTableHost({ children }: { children: ReactNode }) {
  const organizationId = useAppSelector(selectOrganizationId);
  const userId = useAppSelector(selectUserId);
  const anyTable = useSyncExternalStore(subscribeTableMounted, () => tableMounted, () => false);
  const defaultDensity = tableDensityFromKnob(
    useEffectiveKnob(organizationId, userId, TABLE_DENSITY_KNOB_KEY, undefined, { enabled: anyTable }),
  );
  // A RECORD'S OWN MENU (lane DRILL-WIRE): a table naming a person on an administration page offers
  // the admin user menu (`TableDoors.menu`); every other record keeps its open and preview doors.
  const pathname = usePathname();
  const router = useRouter();
  const densityPorts: TableHost = useMemo(
    () => ({
      ...ports,
      resolveEntityDoors: (token: string, id: string, href?: string | null) => {
        const doors = tableEntityDoors(token, id, href);
        const menu = hostEntityMenu(token, id, pathname, (to) => router.push(to));
        return menu && menu.length > 0 ? { ...doors, menu } : doors;
      },
      defaultDensity,
    }),
    [defaultDensity, pathname, router],
  );
  return <MatrxDataTableProvider value={densityPorts}>{children}</MatrxDataTableProvider>;
}
