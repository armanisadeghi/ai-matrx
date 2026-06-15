import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free", {
  title: "Free Tools",
  description: "Free public utilities and mini-apps from AI Matrx.",
});

export default function FreeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
