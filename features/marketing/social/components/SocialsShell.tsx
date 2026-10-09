"use client";

/**
 * The Socials section shell (UI-SPEC §2): ONE header row — the tab strip
 * (Accounts · Studio · Outliers · Swipe file · Ads · KPIs) in the shell
 * header's mode slot, `Track account` as the one primary action. Tabs are
 * route segments, so each is linkable. Body scrolls under the glass header
 * with the shell's header offset.
 */

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { SOCIALS_TABS } from "../types";
import { SocialsContext } from "./SocialsContext";
import { TrackAccountDialog } from "./TrackAccountDialog";

export function SocialsShell({ children }: { children: ReactNode }) {
  const brand = useMarketingBrand();
  const pathname = usePathname();
  const [trackOpen, setTrackOpen] = useState(false);

  const base = marketingRoutes.brandSocials(brand.seg);
  const modes = SOCIALS_TABS.map((tab) => ({ name: tab.label, href: `${base}/${tab.id}` }));
  // Account / post detail belong to the Accounts tab.
  const segment = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split("/")[0] : "";
  const activeTab = SOCIALS_TABS.find((t) => t.id === segment)?.id ?? "accounts";

  return (
    <SocialsContext.Provider
      value={{
        brandId: brand.id,
        brandSeg: brand.seg,
        organizationId: brand.organizationId,
        openTrack: () => setTrackOpen(true),
      }}
    >
      <RecordPageHeader
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
      />
      <div className="h-full overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)]">
        <div className="mx-auto w-full max-w-[1600px] px-3 pb-6 pt-3 sm:px-4">{children}</div>
      </div>
      <TrackAccountDialog
        open={trackOpen}
        onOpenChange={setTrackOpen}
        organizationId={brand.organizationId}
        brandId={brand.id}
        brandSeg={brand.seg}
      />
    </SocialsContext.Provider>
  );
}
