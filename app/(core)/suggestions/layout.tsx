import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/suggestions", {
  title: "Suggestions",
  description:
    "Review AI-found suggestions for your scopes — proposed field values and scope links.",
  letter: "Sg",
});

export default function SuggestionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
