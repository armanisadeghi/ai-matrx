"use client";

// HeaderChooseOrgButton — the soft-enforcement org nudge, living IN the shell
// header's own flow (left of the avatar) instead of floating over the page.
//
// It replaced HeaderOrgReminder, a fixed card that dropped down just under the
// header at z-50 and landed squarely on top of route chrome: on the keyword
// workbench it covered the date-range / compare / Columns controls, and on
// mobile it overprinted the whole filter row. A nudge that hides the controls
// the user came for is worse than no nudge. Header flow can't collide with
// anything, so this version cannot repeat that.
//
// Renders ONLY while the active-org bootstrap has resolved with no org chosen —
// otherwise it takes zero header space. The matching persistent cue is the red
// ring on the avatar (UserMenuTrigger). Clicking opens the canonical
// OrganizationPickerPanel (org list + "Set as default" switch): a real popover
// anchored to this button on desktop, a Drawer on mobile.

import { useState } from "react";
import { Building2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShouldPromptForOrganization } from "@/lib/redux/slices/appContextSlice";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";

export default function HeaderChooseOrgButton() {
  const shouldPrompt = useAppSelector(selectShouldPromptForOrganization);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Stay mounted while the picker is open: selecting an org flips
  // `shouldPrompt` false, but the user may still want the "Set as default"
  // switch (it only enables once an org is active).
  if (!shouldPrompt && !open) return null;

  const trigger = (
    <button
      type="button"
      aria-label="Choose an organization"
      title="Choose an organization"
      className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400 sm:h-8"
    >
      <Building2 size={14} strokeWidth={2} aria-hidden="true" />
      <span className="hidden sm:inline">Choose org</span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{trigger}</span>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Choose an organization</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-2 pb-4">
              <OrganizationPickerPanel />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* No auto-close on select — the user may still toggle "Set as default"
          (enabled only once an org is active). Outside-click / Esc closes. */}
      <PopoverContent align="end" sideOffset={8} className="w-72 p-1">
        <OrganizationPickerPanel />
      </PopoverContent>
    </Popover>
  );
}
