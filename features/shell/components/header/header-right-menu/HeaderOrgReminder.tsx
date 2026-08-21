"use client";

// HeaderOrgReminder — the soft-enforcement NUDGE. Mounted from the existing
// deferred-singleton core so neither this UI nor its picker dependencies enter
// the initial page-load graph. When the active-org bootstrap
// resolves with no org selected (and the user has a real choice to make), a
// small card drops down just under the header, near the avatar, reminding the
// user to choose an organization. It hovers over the page, auto-dismisses after
// a few seconds, and disappears for good once the user engages or dismisses it.
// The permanent cue is the red ring on the avatar (UserMenuTrigger); this peek
// is the one-time attention-grab.
//
// Pattern mirrors features/agents/components/notifications/ImageArrivalPeek
// (motion/react drop-in + auto-dismiss). Clicking "Choose organization" opens
// the canonical OrganizationPickerPanel (org list + "Set as default" switch).

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShouldPromptForOrganization } from "@/lib/redux/slices/appContextSlice";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";

const AUTO_HIDE_MS = 8_000;

// Module-scoped so the reminder shows AT MOST ONCE per session — it must never
// re-drop on route changes / shell remounts. After dismissal the red avatar
// ring remains as the persistent cue.
let dismissedThisSession = false;

export default function HeaderOrgReminder() {
  const shouldPrompt = useAppSelector(selectShouldPromptForOrganization);
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [engaged, setEngaged] = useState(false);

  // Derived, not synced via setState-in-effect: the peek shows whenever the app
  // wants an org chosen and the user hasn't dismissed it. We ALSO keep it
  // mounted while the picker popover is open — selecting an org flips
  // `shouldPrompt` false, but the user may still want to toggle "Set as
  // default" (the switch only enables once an org is active). The peek exits
  // once the popover closes. AnimatePresence plays the exit either way.
  const show = (shouldPrompt && !dismissed) || pickerOpen;

  const dismiss = () => {
    dismissedThisSession = true;
    setDismissed(true);
  };

  // Engaging (hover / opening the picker) cancels auto-hide for good — the user
  // is clearly paying attention now.
  const engage = () => setEngaged(true);

  // Auto-hide countdown — runs only while shown, un-engaged, and picker closed.
  // setState happens in the timer callback (not synchronously), so no cascade.
  useEffect(() => {
    if (!show || engaged || pickerOpen) return undefined;
    const timer = setTimeout(() => {
      dismissedThisSession = true;
      setDismissed(true);
    }, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [show, engaged, pickerOpen]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="org-reminder"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          // pointerEvents flips to "none" the instant the exit starts (motion
          // applies non-animatable values immediately), and the exit runs on a
          // finite tween rather than the entrance spring — a spring only
          // asymptotes toward opacity 0, so the card could stay mounted,
          // invisible, and still swallowing clicks at z-50 over the page's own
          // top-right controls.
          exit={{ opacity: 0, y: -8, scale: 0.97, pointerEvents: "none" }}
          transition={{
            type: "spring",
            stiffness: 360,
            damping: 30,
            exit: { type: "tween", duration: 0.18, ease: "easeOut" },
          }}
          onMouseEnter={engage}
          style={{ top: "calc(var(--header-height, 2.5rem) + 0.5rem)" }}
          className="fixed left-3 right-3 z-50 overflow-hidden rounded-xl border border-border bg-card shadow-lg sm:left-auto sm:w-72"
          role="status"
        >
          {/* Auto-dismiss progress bar — hidden once the user engages */}
          {!engaged && !pickerOpen && (
            <div className="absolute left-0 right-0 top-0 h-0.5 overflow-hidden bg-muted">
              <div
                className="h-full origin-left bg-red-500"
                style={{
                  animation: `shrink ${AUTO_HIDE_MS}ms linear forwards`,
                }}
              />
              <style>{`@keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
            </div>
          )}

          {/* Header row */}
          <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10">
              <Building2
                size={13}
                strokeWidth={2}
                className="text-red-500 dark:text-red-400"
              />
            </span>
            <span className="flex-1 text-xs font-semibold leading-none text-foreground">
              Choose an organization
            </span>
            <button
              type="button"
              onClick={dismiss}
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
              aria-label="Dismiss reminder"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Body */}
          <p className="px-3 pb-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Pick an organization for this workspace.
          </p>

          {/* CTA → org picker popover */}
          <div className="px-2 pb-2">
            <Popover
              open={pickerOpen}
              onOpenChange={(open) => {
                setPickerOpen(open);
                if (open) engage();
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:h-8"
                >
                  <Building2 size={13} strokeWidth={2} />
                  Choose
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-72 p-1">
                {/* No auto-close on select — the user may still toggle "Set as
                    default" (enabled only once an org is active). They close
                    the popover (outside-click / Esc) when done. */}
                <OrganizationPickerPanel />
              </PopoverContent>
            </Popover>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
