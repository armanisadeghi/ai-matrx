"use client";

// Keeps the person's saved time zone (userPreferences.display.timeZone) equal
// to the browser's while they have not pinned one. Mounted once in the shell.
// Waits for the saved preferences to LOAD first, so a first paint of defaults
// never overwrites a pinned choice.

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { readDeviceTimeZone, zoneToCapture } from "@/lib/time/personTimeZone";

export default function PersonTimeZoneCapture() {
  const dispatch = useAppDispatch();
  const loaded = useAppSelector((s) => s.userPreferences?._meta?.loadStatus === "loaded");
  const saved = useAppSelector((s) => s.userPreferences?.display?.timeZone);
  const follows = useAppSelector((s) => s.userPreferences?.display?.timeZoneFollowsDevice);

  useEffect(() => {
    if (!loaded) return;
    const next = zoneToCapture({ saved, followsDevice: follows, device: readDeviceTimeZone() });
    if (next) {
      dispatch(setPreference({ module: "display", preference: "timeZone", value: next }));
    }
  }, [loaded, saved, follows, dispatch]);

  return null;
}
