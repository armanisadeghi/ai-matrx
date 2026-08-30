"use client";

import type { SiteListRow } from "@/features/marketing/types";
import { lazyOverlay } from "@/features/overlays/boundary/lazyOverlay";

export interface SitePeekWindowProps {
  site: SiteListRow;
  onClose: () => void;
}

/**
 * The one importable front door for the site Quick view. Both the main Sites
 * list and Content Plan list reuse this boundary, so the WindowPanel graph is
 * loaded only after a person asks to inspect one site.
 */
const SitePeekWindow = lazyOverlay<SitePeekWindowProps>(
  () => import("./SitePeekWindowImpl"),
  undefined,
  "@/features/marketing/components/sites/SitePeekWindowImpl",
);

export default SitePeekWindow;
