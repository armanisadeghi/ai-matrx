import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/intake/v3", {
  title: "Intake Capture v3",
  description:
    "The vertical-rail intake capture camera (hold-shutter, right rail, one media door) — isolated from the live /commerce/intake surface.",
  letter: "In",
});

export default function CommerceIntakeV3Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
