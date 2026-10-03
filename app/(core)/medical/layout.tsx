import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/medical", {
  title: "Medical",
  description:
    "AI Matrx for medical practices: turn a clinician's know-how into reliable AI systems the whole practice can use.",
  letter: "MH",
  canonicalPath: "/medical",
});

export default function MedicalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
