import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/stores/connect", {
  title: "Connect a Store",
  description:
    "Onboarding: configure the pipeline, connect an eBay store, capture the first items.",
  letter: "Co",
});

export default function CommerceStoreConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
