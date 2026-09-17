/**
 * features/window-panels/windows/detail/DetailDocked.tsx
 *
 * The `detailDocked` overlay entry — the Detail primitive's DOCKED
 * presentation: a resizable side panel docked to the right edge (Notion's
 * side peek), a bottom sheet on phones. Binds the docked shell
 * (`SidePanelSurface`) right above the presentation; everything else comes
 * from the light host binding in `detail/DetailHost.tsx`.
 */

"use client";

import type { DetailRef } from "@ai-matrx/detail";
import { DetailDockedPresentation, DetailHostProvider } from "@ai-matrx/detail/react";
import { DetailDockedShell } from "@/features/window-panels/detail/shells/DetailDockedShell";
import { toDetailInstanceData } from "@/features/window-panels/detail/detailOverlayData";
import { DETAIL_TYPE_BINDING } from "@/features/window-panels/detail/detailTypeBinding";

export interface DetailDockedProps {
  isOpen: boolean;
  onClose: () => void;
  type: string | null;
  id: string | null;
  seedName: string | null;
  seedAbout: string | null;
  listItems: DetailRef[] | null;
  listIndex: number | null;
  /** Length of the list this window was cut from, or null when nothing was cut (NEW-13). */
  listTrimmedFrom: number | null;
}

const SHELLS = { Docked: DetailDockedShell };

export default function DetailDocked({
  isOpen,
  onClose,
  type,
  id,
  seedName,
  seedAbout,
  listItems,
  listIndex,
  listTrimmedFrom,
}: DetailDockedProps) {
  if (!isOpen || !type || !id) return null;
  const data = toDetailInstanceData({ type, id, seedName, seedAbout, listItems, listIndex, listTrimmedFrom });
  return (
    <DetailHostProvider ports={{ ...DETAIL_TYPE_BINDING, shells: SHELLS }}>
      <DetailDockedPresentation data={data} onClose={onClose} />
    </DetailHostProvider>
  );
}
