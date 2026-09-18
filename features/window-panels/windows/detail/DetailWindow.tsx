/**
 * features/window-panels/windows/detail/DetailWindow.tsx
 *
 * The `detailWindow` overlay entry — the Detail primitive's WINDOW
 * presentation (the platform default; Arman, 2026-09-17: "The default is the
 * window"). It replaced `windows/item-detail/ItemDetailWindow.tsx`: every
 * item-presentation type that opened the generic dossier opens here with the
 * same body, plus the docked and page presentations for free.
 *
 * This file is the lazily loaded boundary that binds the WINDOW SHELL
 * (`WindowPanel`) right above the presentation; the light host binding in
 * `detail/DetailHost.tsx` (mounted in app/Providers.tsx) carries everything
 * else. Reached only through `OverlayController`'s `lazyOverlay` block.
 */

"use client";

import { DetailHostProvider } from "@/lib/detail/host";
import { DetailWindowPresentation } from "@/lib/detail/presentations";
import type { DetailRef } from "@/lib/detail/types";
import { DetailWindowShell } from "@/features/window-panels/detail/shells/DetailWindowShell";
import { toDetailInstanceData } from "@/features/window-panels/detail/detailOverlayData";
import { DETAIL_TYPE_BINDING } from "@/features/window-panels/detail/detailTypeBinding";

export interface DetailWindowProps {
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

const SHELLS = { Window: DetailWindowShell };

export default function DetailWindow({
  isOpen,
  onClose,
  type,
  id,
  seedName,
  seedAbout,
  listItems,
  listIndex,
  listTrimmedFrom,
}: DetailWindowProps) {
  if (!isOpen || !type || !id) return null;
  const data = toDetailInstanceData({ type, id, seedName, seedAbout, listItems, listIndex, listTrimmedFrom });
  return (
    <DetailHostProvider ports={{ ...DETAIL_TYPE_BINDING, shells: SHELLS }}>
      <DetailWindowPresentation data={data} onClose={onClose} />
    </DetailHostProvider>
  );
}
