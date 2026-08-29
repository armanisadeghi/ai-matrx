import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/intake", {
  title: "Intake Capture",
  description:
    "Camera-first warehouse intake: QR-keyed and untracked capture of photos, video and voice onto commerce intake assets.",
  letter: "In",
});

export default function CommerceIntakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
