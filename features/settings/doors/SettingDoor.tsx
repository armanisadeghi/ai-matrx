"use client";

/**
 * SettingDoor — the canonical way to point from behaviour to the exact
 * control that governs it. User settings open the existing settings shell;
 * organization settings use a real deep link so they remain bookmarkable and
 * preserve native new-tab behaviour.
 */

import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { settingDoorHref, type SettingDoorTarget } from "./settingDoorTarget";

export function SettingDoor({
  target,
  label = "Open setting",
  variant = "link",
  size = "sm",
}: {
  target: SettingDoorTarget;
  label?: string;
  variant?: "link" | "outline" | "ghost";
  size?: "sm" | "default";
}) {
  const dispatch = useAppDispatch();
  const href = settingDoorHref(target);

  return (
    <Button asChild variant={variant} size={size}>
      <Link
        href={href}
        onClick={(event) => {
          if (
            target.scope !== "user" ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.button === 1
          ) {
            return;
          }
          event.preventDefault();
          dispatch(
            openOverlay({
              overlayId: "userPreferencesWindow",
              data: {
                initialTabId: target.tabId,
                initialControlId: target.controlId,
              },
            }),
          );
        }}
      >
        <Settings className="h-3.5 w-3.5" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
