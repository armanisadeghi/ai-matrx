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
} from "@ai-matrx/design-system";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectShouldPromptForOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";

export default function HeaderChooseOrgButton() {
  const shouldPrompt = useAppSelector(selectShouldPromptForOrganization);
  const organizationId = useAppSelector(selectOrganizationId);
  const organizationName = useAppSelector(selectOrganizationName);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Stay mounted while the picker is open: selecting an org flips
  // `shouldPrompt` false, but the user may still want the "Set as default"
  // switch (it only enables once an org is active).
  if (!shouldPrompt && !open) return null;

  // 🚨 THE ONE STATE THIS CONTROL KEEPS ITSELF ALIVE FOR IS THE ONE IT USED TO
  // LIE ABOUT. After a selection the button is still on screen — by design,
  // for "Set as default" — and it went on reading "Choose org" in warning red
  // with the chosen organization ticked in its own open panel (Acquisition
  // Console walk, 2026-09-20, `console-1440-light.png`). A control that
  // contradicts its own panel is the same defect as a dead-looking one, so the
  // label follows the selection and the warning colour goes with the warning.
  // The name can lag the id by a beat (it is written by the same switcher
  // action, but a cookie/bootstrap restore can land the id first), so the
  // nameless case says what the control now DOES rather than falling back to
  // the sentence that is no longer true.
  const chosen = organizationId != null;
  const label = chosen ? (organizationName ?? "Change workspace") : "Choose org";
  const description = chosen
    ? organizationName
      ? `Workspace: ${organizationName}. Change workspace`
      : "Change workspace"
    : "Choose an organization";

  const trigger = (
    <button
      type="button"
      aria-label={description}
      title={description}
      className={`inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors sm:h-8 ${
        chosen
          ? "text-muted-foreground hover:bg-accent hover:text-foreground"
          : "text-red-600 hover:bg-red-500/10 dark:text-red-400"
      }`}
    >
      <Building2 size={14} strokeWidth={2} aria-hidden="true" />
      <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
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
      <PopoverContent sizing="content" align="end" sideOffset={8} className="p-1">
        <OrganizationPickerPanel />
      </PopoverContent>
    </Popover>
  );
}
