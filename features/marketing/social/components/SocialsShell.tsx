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

import { useIsMobile } from "@ai-matrx/kit/media-query";
import { PageSurfaceMenu } from "@/features/context-menu-v3/PageSurfaceMenu";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
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
  const isMobile = useIsMobile();
  const pathname = usePathname();
  // `?track=<link or @handle>` — a deep link from another feature (a research topic's
  // Social tab) opens the Track dialog with the account already typed in.
  const trackParam = useSearchParams().get("track");
  const [trackOpen, setTrackOpen] = useState(() => Boolean(trackParam));

  // What the viewer may DO is the record's own access answer; RLS stays the boundary.
  const canEdit = canEditAccess(useAccess("web_brand", brand.id).level);
  const base = marketingRoutes.brandSocials(brand.seg);
  const modes = SOCIALS_TABS.map((tab) => ({ name: tab.label, href: `${base}/${tab.id}`, icon: TAB_ICONS[tab.id] }));
  // Account / post detail belong to the Accounts tab.
  // Read from the address itself: the brand may be addressed by key or by id (until the canonical redirect lands), and a
  // prefix compare against one form misreads the other as the Accounts tab, drawing this shell's header over Studio's own.
  const afterSocials = pathname.split("/socials/")[1];
  const segment = afterSocials ? afterSocials.split("/")[0] : "";
  const activeTab = SOCIALS_TABS.find((t) => t.id === segment)?.id ?? "accounts";

  const fullBleed = activeTab === "studio";
  // An account's own page shows its tracked state + Refresh; a second "Track account" there reads as if
  // this account were not tracked yet.
  const onAccountPage = segment !== "" && !SOCIALS_TABS.some((t) => t.id === segment) && segment !== "post";

  return (
    <SocialsContext.Provider
      value={{
        brandId: brand.id,
        brandSeg: brand.seg,
        organizationId: brand.organizationId,
        openTrack: () => setTrackOpen(true),
        canEdit,
      }}
    >
      {fullBleed ? null : <RecordPageHeader
        parents={[
          { label: "Marketing", href: marketingRoutes.home() },
          { label: brand.name, href: `/marketing/${brand.seg}` },
        ]}
        // Phone: the header row is back + name, so the name carries the PAGE ("Socials · Outliers") and
        // is the compact switcher between the tabs; desktop keeps the tab strip in the center.
        record={
          isMobile
            ? {
                name: `Socials · ${SOCIALS_TABS.find((t) => t.id === activeTab)?.label ?? ""}`,
                siblings: modes.map((m) => ({ label: m.name, href: m.href, active: m.href === `${base}/${activeTab}` })),
              }
            : { name: "Socials" }
        }
        modes={modes}
        activeModeHref={`${base}/${activeTab}`}
        actions={
          onAccountPage || !canEdit
            ? []
            : [{ label: "Track account", icon: Plus, primary: true, showLabel: true, pinnedOnPhone: true, onPress: () => setTrackOpen(true) }]
        }
      />}
      {fullBleed ? (
        // The Studio is the Board, exactly as /board/<id>: its workspace header is the page top, full-bleed.
        <div className="h-full min-h-0">{children}</div>
      ) : (
        <PageSurfaceMenu sourceFeature="marketing">
          <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
            <div className="mx-auto w-full max-w-[1600px] px-3 pb-6 pt-3 sm:px-4">{children}</div>
          </div>
        </PageSurfaceMenu>
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
