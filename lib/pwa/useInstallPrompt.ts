"use client";

/**
 * React binding for `lib/pwa/install.ts`. Subscribes with useSyncExternalStore
 * so availability stays correct when `beforeinstallprompt` arrives after mount
 * and when the app is installed mid-session.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  getInstallAvailability,
  promptInstall,
  subscribeToInstallAvailability,
  type InstallAvailability,
} from "./install";

export function useInstallPrompt(): {
  availability: InstallAvailability;
  install: () => Promise<"accepted" | "dismissed" | null>;
} {
  const availability = useSyncExternalStore<InstallAvailability>(
    subscribeToInstallAvailability,
    getInstallAvailability,
    // Server render: never claim installability before we can detect it.
    () => "unavailable",
  );

  const install = useCallback(() => promptInstall(), []);

  return { availability, install };
}
