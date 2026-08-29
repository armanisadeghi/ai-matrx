import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/triage", {
  title: "Warehouse Triage",
  description:
    "Gate 1 — fast, image-first value-bucket decisions on intake assets awaiting triage.",
  letter: "Tr",
});

export default function CommerceTriageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
