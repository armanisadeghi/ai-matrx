import { createRouteMetadata } from "@/utils/route-metadata";

// Arman, 2026-09-20: playgrounds never live under admin — admin manages,
// it does not run code. The Decision playground moved here from
// `/administration/ai/ai-models/decisions`; it is a normal authenticated route.
export const metadata = createRouteMetadata("/decisions", {
  title: "Decisions",
  description:
    "Ask a typed decision model named Choice, Score, and Noul questions about a state and use each answer directly.",
  letter: "Dn",
});

export default function DecisionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
