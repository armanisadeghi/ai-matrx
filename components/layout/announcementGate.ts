import type { RootState } from "@/lib/redux/store";

/**
 * Announcements (and the spend alarm panel) may mount once we know WHO is
 * looking and whether the person's saved "already acknowledged" list has
 * landed or definitively failed to. Both facts are owned by slices that are
 * actually fed at boot: the server-hydrated `userAuth` and the sync engine's
 * `userPreferences._meta.loadStatus`.
 *
 * This replaces a gate on `userProfile.shellDataLoaded`, whose only dispatcher
 * (`DeferredShellData`) stopped being mounted when the (ssr) layout was retired
 * (2026-03-26): the flag stayed false forever and no announcement ever showed.
 * A failed preferences load still opens the gate: an alarm shown twice beats
 * an alarm that never shows.
 */
export const selectAnnouncementsReady = (state: RootState): boolean =>
  !!state.userAuth.id &&
  state.userPreferences._meta.loadStatus !== "loading";
