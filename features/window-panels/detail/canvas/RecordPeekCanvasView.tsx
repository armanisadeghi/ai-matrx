"use client";

/**
 * The body of a `record-peek` canvas tab: the canonical docked presentation
 * (`DetailDockedPresentation`) with the canvas as its shell. The pane header is
 * the chrome — the tab carries the record's name and the record's own
 * controls (previous / next, other presentations, copy id) are portaled into
 * the header; in a narrow pane the optional ones join the pane's one menu.
 *
 * Inside a tab, "docked" means THIS tab: stepping to the next record in the
 * list re-keys the tab in place (Notion's peek arrows), and closing the docked
 * presentation closes the tab. Every other port is the app's DetailHost.
 */

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useCanvasMenuItems, type CanvasKindProps } from "@ai-matrx/canvas/react";
import {
  DetailDockedPresentation,
  DetailHostProvider,
  useDetailHost,
  type DetailDockedShellProps,
  type DetailHostPorts,
  type DetailMenuAction,
} from "@ai-matrx/detail/react";
import { DETAIL_URL_AS_ARG, DETAIL_URL_TYPE_KEY } from "@ai-matrx/detail";
import { KindHeaderPortal, useKindPaneHeaderWidth } from "@/features/canvas/host/kindHeaderSlot";
import { useUrlSync } from "@/features/window-panels/url-sync/useUrlSync";
import { DETAIL_TYPE_BINDING } from "../detailTypeBinding";
import { readRecordPeekData, recordPeekOpenInput } from "./recordPeek";

const PeekTabContext = createContext<CanvasKindProps | null>(null);

/** Below this pane width the record's optional controls fold into "More". */
const COMPACT_PANE_BELOW_PX = 560;

/**
 * The record's controls in the pane header. In a narrow pane only previous /
 * next stay in the header (when the record came from a list); the optional
 * actions (open as window / page, copy id) join the pane's ONE menu through
 * `useCanvasMenuItems` — never a second overflow button beside the pane's.
 */
function HeaderActions({
  itemId,
  hasList,
  actions,
  navActions,
  menuActions,
}: {
  itemId: string;
  hasList: boolean;
  actions: ReactNode;
  navActions: ReactNode;
  menuActions: readonly DetailMenuAction[];
}) {
  const width = useKindPaneHeaderWidth(itemId);
  const compact = width !== null && width < COMPACT_PANE_BELOW_PX;
  useCanvasMenuItems(itemId, compact ? menuActions : []);
  if (compact && !hasList) return null;
  return <KindHeaderPortal itemId={itemId}>{compact ? navActions : actions}</KindHeaderPortal>;
}

function RecordPeekShell({ instanceKey, title, actions, navActions, menuActions, children }: DetailDockedShellProps) {
  // The tab on screen keeps its `?panels=detail:<type>.<id>:as-docked` address,
  // so a copied link reopens this record as a tab.
  useUrlSync(DETAIL_URL_TYPE_KEY, instanceKey, { [DETAIL_URL_AS_ARG]: "docked" });
  const tab = useContext(PeekTabContext);
  const itemId = tab?.item.id ?? null;
  const tabTitle = tab?.item.title ?? null;
  const canvas = tab?.canvas ?? null;

  // The tab shows the record's resolved name, not the opener's seed.
  useEffect(() => {
    if (canvas && itemId && title && title !== tabTitle) canvas.update(itemId, { title });
  }, [canvas, itemId, title, tabTitle]);

  return (
    <>
      {itemId ? (
        <HeaderActions
          itemId={itemId}
          hasList={Boolean(tab && readRecordPeekData(tab.data)?.list)}
          actions={actions}
          navActions={navActions}
          menuActions={menuActions}
        />
      ) : null}
      <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-record-peek>
        {children}
      </div>
    </>
  );
}

export default function RecordPeekCanvasView(props: CanvasKindProps) {
  const { item, canvas } = props;
  const host = useDetailHost();
  const record = readRecordPeekData(props.data);

  if (!record) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        This tab names no record.
      </div>
    );
  }

  const ports: Partial<DetailHostPorts> = {
    ...DETAIL_TYPE_BINDING,
    shells: { Docked: RecordPeekShell },
    open: ({ presentation, data }) => {
      if (presentation !== "docked") {
        host.open({ presentation, data });
        return;
      }
      const next = recordPeekOpenInput(data);
      const nextId = canvas.rekey(item.id, next.key) ?? item.id;
      canvas.update(nextId, { data: next.data, ...(next.title ? { title: next.title } : {}) });
    },
    close: (presentation) => {
      if (presentation === "docked") canvas.close(item.id);
      else host.close(presentation);
    },
  };

  return (
    <PeekTabContext.Provider value={props}>
      <DetailHostProvider ports={ports}>
        <DetailDockedPresentation data={record} onClose={() => canvas.close(item.id)} />
      </DetailHostProvider>
    </PeekTabContext.Provider>
  );
}
