"use client";

/**
 * Announcement Provider — thin client shell.
 *
 * Gates on `selectAnnouncementsReady` (signed in + saved preferences
 * settled; see announcementGate.ts). The body — server-action call to
 * `getActiveAnnouncements`, `SystemAnnouncement` types, and the
 * `SystemAnnouncementBanner` markup — lives in
 * `AnnouncementProviderImpl.tsx` and is `next/dynamic`-loaded only after
 * shell data finishes hydrating, so its dep graph never enters the
 * static graph of any route.
 */

import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAnnouncementsReady } from "./announcementGate";

const AnnouncementProviderImpl = dynamic(
  () => import("./AnnouncementProviderImpl"),
  { ssr: false, loading: () => null },
);

export default function AnnouncementProvider() {
  const ready = useAppSelector(selectAnnouncementsReady);
  if (!ready) return null;
  return <AnnouncementProviderImpl />;
}
