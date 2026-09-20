import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/acquisition", {
  title: "Acquisition",
  description: "See connected sources, account access, and the action needed to unblock each source.",
  letter: "AQN",
});

export default function AcquisitionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
