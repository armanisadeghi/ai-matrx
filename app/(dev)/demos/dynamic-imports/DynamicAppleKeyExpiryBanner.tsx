"use client";

import dynamic from "next/dynamic";

const AppleKeyExpiryNotifier = dynamic(
  () => import("@/components/admin/AppleKeyExpiryNotifier"),
  { ssr: false },
);

export function DynamicAppleKeyExpiryBanner() {
  return <AppleKeyExpiryNotifier />;
}
