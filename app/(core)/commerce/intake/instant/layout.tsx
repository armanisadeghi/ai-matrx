import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/intake/instant", {
  title: "Intake Instant Capture",
  description:
    "Intake capture with the client-run instant analysis lane: Process streams the intake record live through the commerce_intake.instant_analysis mandate.",
  letter: "In",
});

export default function CommerceIntakeInstantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
