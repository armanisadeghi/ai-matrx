import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/features", {
  title: "Features",
  description:
    "Browse every surface of the AI Matrx platform — chat, agents, files, notes, and more.",
  letter: "Ft",
});

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
