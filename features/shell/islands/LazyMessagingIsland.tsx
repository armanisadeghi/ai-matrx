"use client";

/**
 * The messaging side sheet, loaded lazily.
 *
 * There is no initializer island any more: the conversation list, unread
 * counts and the inbox channel come from the ONE `<MessagingHost>` mounted in
 * `app/Providers.tsx`, so the badge is right from first paint without this
 * island being on screen.
 */

import dynamic from "next/dynamic";

const LazyMessagingSideSheet = dynamic(
  () =>
    import("@/features/messaging/components/MessagingSideSheet").then(
      (m) => m.MessagingSideSheet,
    ),
  { ssr: false, loading: () => null },
);

export default function LazyMessagingIsland() {
  return <LazyMessagingSideSheet />;
}
