"use client";

/**
 * A form over the person's saved preferences is an answer only after those
 * preferences LOADED. Until then the `userPreferences` slice holds built-in
 * defaults, and a settings screen that renders them says "these are your
 * settings" when they are not — worst when the load FAILED, because nothing
 * would ever correct it.
 *
 *   loading → a wait (never the defaults)
 *   failed  → the failure with the Alchemy Menu and a retry (never the defaults)
 *   loaded  → the form
 *
 * Gate ONLY the section that reads saved preferences — never a whole tab or
 * page — so a failed load never hides settings that do not depend on it:
 *
 *   <PreferencesLoadGate what="your link setting"><SettingsSection …/></PreferencesLoadGate>
 *
 * (guard: features/settings/__tests__/reads-user-preferences.test.ts). A page
 * whose whole body is one preferences form may gate itself with an early return:
 *
 *   const prefsLoad = usePreferencesLoad();
 *   …other hooks…
 *   if (prefsLoad.status !== "loaded") return <PreferencesLoadState load={prefsLoad} what="your sandbox defaults" />;
 */
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectPreferencesLoadError,
  selectPreferencesLoadStatus,
} from "@/lib/redux/preferences/userPreferenceSelectors";
import { retryPreferencesLoad } from "@/lib/redux/preferences/preferencesLoad";
import type { PreferencesLoadStatus } from "@/lib/redux/preferences/userPreferencesSlice";

export interface PreferencesLoad {
  status: PreferencesLoadStatus;
  error: string | null;
  retry: () => void;
}

/** The load state of the person's saved preferences, with a retry of that same load. */
export function usePreferencesLoad(): PreferencesLoad {
  const store = useAppStore();
  const status = useAppSelector(selectPreferencesLoadStatus);
  const error = useAppSelector(selectPreferencesLoadError);
  return {
    status,
    error,
    retry: () => {
      void retryPreferencesLoad(store);
    },
  };
}

/** What to show instead of a preferences form while the saved preferences are not loaded. */
export function PreferencesLoadState({
  load,
  what = "your saved settings",
}: {
  load: PreferencesLoad;
  what?: string;
}) {
  if (load.status === "failed") {
    return (
      <ReadFailure
        error={load.error ?? true}
        what={what}
        onRetry={load.retry}
        size="default"
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"
      role="status"
      aria-busy="true"
    >
      <Loader2 className="h-4 w-4 animate-spin" /> Loading {what}…
    </div>
  );
}

export function PreferencesLoadGate({
  what,
  children,
}: {
  what?: string;
  children: ReactNode;
}) {
  const load = usePreferencesLoad();
  if (load.status !== "loaded") return <PreferencesLoadState load={load} what={what} />;
  return <>{children}</>;
}
