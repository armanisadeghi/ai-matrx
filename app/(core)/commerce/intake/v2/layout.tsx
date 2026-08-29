import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/intake/v2", {
  title: "Intake Capture v2",
  description:
    "The iPhone-style rebuild of the intake capture camera (capture-camera package staging) — isolated from the live /commerce/intake surface.",
  letter: "In",
});

export default function CommerceIntakeV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
