"use client";

/**
 * The Socials section shell (UI-SPEC §2): ONE header row — the tab strip
 * (Accounts · Studio · Outliers · Swipe file · Ads · KPIs) in the shell
 * header's mode slot, `Track account` as the one primary action. Tabs are
 * route segments, so each is linkable. Body scrolls under the glass header
 * with the shell's header offset.
 */

import { useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bookmark,
  Clapperboard,
  Megaphone,
  Plus,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { SOCIALS_TABS, type SocialsTabId } from "../types";
import { SocialsContext } from "./SocialsContext";
import { TrackAccountDialog } from "./TrackAccountDialog";

// Every tab carries an icon so the header's mode nav can narrow to an icon pill
// (still one click per tab) before it ever folds the tabs into a dropdown.
const TAB_ICONS: Record<SocialsTabId, LucideIcon> = {
  accounts: Users,
  studio: Clapperboard,
  outliers: TrendingUp,
  swipe: Bookmark,
  ads: Megaphone,
  kpis: Target,
};

export function SocialsShell({ children }: { children: ReactNode }) {
  const brand = useMarketingBrand();
  const pathname = usePathname();
  // `?track=<link or @handle>` — a deep link from another feature (a research topic's
  // Social tab) opens the Track dialog with the account already typed in.
  const trackParam = useSearchParams().get("track");
  const [trackOpen, setTrackOpen] = useState(() => Boolean(trackParam));

  const base = marketingRoutes.brandSocials(brand.seg);
  const modes = SOCIALS_TABS.map((tab) => ({ name: tab.label, href: `${base}/${tab.id}`, icon: TAB_ICONS[tab.id] }));
  // Account / post detail belong to the Accounts tab.
  const segment = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split("/")[0] : "";
  const activeTab = SOCIALS_TABS.find((t) => t.id === segment)?.id ?? "accounts";

  const fullBleed = activeTab === "studio";

  return (
    <SocialsContext.Provider
      value={{
        brandId: brand.id,
        brandSeg: brand.seg,
        organizationId: brand.organizationId,
        openTrack: () => setTrackOpen(true),
      }}
    >
      {fullBleed ? null : <RecordPageHeader
        parents={[
          { label: "Marketing", href: marketingRoutes.home() },
          { label: brand.name, href: `/marketing/${brand.seg}` },
        ]}
        record={{ name: "Socials" }}
        modes={modes}
        activeModeHref={`${base}/${activeTab}`}
        actions={[
          { label: "Track account", icon: Plus, primary: true, showLabel: true, onPress: () => setTrackOpen(true) },
        ]}
      />}
      {fullBleed ? (
        // The Studio is the Board, exactly as /board/<id>: its workspace header is the page top, full-bleed.
        <div className="h-full min-h-0">{children}</div>
      ) : (
        <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
          <div className="mx-auto w-full max-w-[1600px] px-3 pb-6 pt-3 sm:px-4">{children}</div>
        </div>
      )}
      <TrackAccountDialog
        open={trackOpen}
        onOpenChange={setTrackOpen}
        organizationId={brand.organizationId}
        brandId={brand.id}
        brandSeg={brand.seg}
        initialText={trackParam ?? undefined}
      />
    </SocialsContext.Provider>
  );
}
