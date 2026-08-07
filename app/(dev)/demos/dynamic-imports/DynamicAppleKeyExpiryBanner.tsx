"use client";

import dynamic from "next/dynamic";

const CredentialExpiryNotifier = dynamic(
  () => import("@/components/admin/CredentialExpiryNotifier"),
  { ssr: false },
);

export function DynamicAppleKeyExpiryBanner() {
  return <CredentialExpiryNotifier />;
}
