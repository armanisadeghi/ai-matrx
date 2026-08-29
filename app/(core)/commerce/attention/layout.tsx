import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/attention", {
  title: "Commerce Attention",
  description:
    "Recall disagreements, escalations and high-impact open questions — the human safety net.",
  letter: "At",
});

export default function CommerceAttentionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
