import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/welcome", {
  title: "Welcome",
  description: "Get started with AI Matrx.",
});

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
