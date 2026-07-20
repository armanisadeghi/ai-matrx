/**
 * Fires a non-blocking toast on every mount while there are unviewed
 * recovered items. Mounts once inside RequestRecoveryProvider so every
 * authenticated route sees the nudge until the user opens the window.
 */

"use client";

import React, { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useRequestRecovery } from "../providers/RequestRecoveryProvider";

export function RecoveryNudge() {
  const { hasNewItems, items, open } = useRequestRecovery();
  const nudged = useRef(false);

  useEffect(() => {
    if (nudged.current) return;
    if (!hasNewItems) return;
    nudged.current = true;
    const newCount = items.filter((i) => !i.viewedByUser).length;
    toast.info(
      newCount === 1
        ? "You have 1 saved submission to recover."
        : `You have ${newCount} saved submissions to recover.`,
      {
        description: "Click 'Recovery' in the top bar to view, retry, or delete.",
        duration: 8000,
        action: {
          label: "Open",
          onClick: open,
        },
      },
    );
  }, [hasNewItems, items, open]);

  return null;
}
