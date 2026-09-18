"use client";

/**
 * Announcement Provider — thin client shell.
 *
 * Gates on `shellDataLoaded` (already part of the page's static graph
 * via the user slice). The body — server-action call to
 * `getActiveAnnouncements`, `SystemAnnouncement` types, and the
 * `SystemAnnouncementBanner` markup — lives in
 * `AnnouncementProviderImpl.tsx` and is `next/dynamic`-loaded only after
 * shell data finishes hydrating, so its dep graph never enters the
 * static graph of any route.
 */

import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShellDataLoaded } from "@/lib/redux/slices/userSlice";

const AnnouncementProviderImpl = dynamic(
  () => import("./AnnouncementProviderImpl"),
  { ssr: false, loading: () => null },
);

export default function AnnouncementProvider() {
  const shellDataLoaded = useAppSelector(selectShellDataLoaded);
  if (!shellDataLoaded) return null;
  return <AnnouncementProviderImpl />;
}
