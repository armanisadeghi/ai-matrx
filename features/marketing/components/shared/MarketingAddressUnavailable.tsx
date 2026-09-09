import { notFound } from "next/navigation";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { isUuid } from "@/features/marketing/lib/keys";

/** An empty UUID read is ambiguous; only the access service may classify it. */
export function MarketingAddressUnavailable({
  token,
  address,
}: {
  token: "web_brand" | "web_site";
  address: string;
}) {
  // An opaque key has no record identity for an authorized access probe.
  if (!isUuid(address)) notFound();
  return (
    <AccessGate
      token={token}
      id={address}
      fallbackHref="/marketing"
      fallbackLabel="Marketing"
    />
  );
}
