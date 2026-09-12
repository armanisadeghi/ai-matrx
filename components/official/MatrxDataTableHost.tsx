"use client";

// Component identities only: all table state, rows, filters, copy orchestration,
// and row-window contents belong to the design-system package. No startup IO.
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MatrxDataTableProvider, type MatrxDataTableHost as TableHost, type TableWindowPanelProps } from "@ai-matrx/design-system/data-table/host";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { toast } from "@/lib/toast";

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
const ports: TableHost = {
  Link,
  CopyControls: CopyButtons,
  EntityRef,
  SidePanelSurface,
  WindowPanel: TableWindowPanel,
  ResourcePeek: ResourcePeekHost,
  resolveEntityDoors: (token, id, href) => {
    const doors = resolveEntityDoors(token, id, href);
    return { ...(doors.href === null ? {} : { href: doors.href }), peekKind: doors.peekKind, canPeek: doors.canPeek };
  },
  notify: toast,
};
export function MatrxDataTableHost({ children }: { children: ReactNode }) {
  return <MatrxDataTableProvider value={ports}>{children}</MatrxDataTableProvider>;
}
