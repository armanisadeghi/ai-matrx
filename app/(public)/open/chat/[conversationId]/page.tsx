import type { Metadata } from "next";

import { PublicChatOpener } from "@/features/social-cards/PublicChatOpener";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

interface PublicChatOpenerPageProps {
  params: Promise<{ conversationId: string }>;
}

const robots = { index: false, follow: false };

export async function generateMetadata({
  params,
}: PublicChatOpenerPageProps): Promise<Metadata> {
  const { conversationId } = await params;
  return {
    ...createDynamicRouteMetadata("/chat", {
      title: "Approval needed",
      description: "A secure action from your AI Matrx text assistant is waiting for your review.",
      letter: "C",
      socialCard: {
        eyebrow: "Text assistant",
        intent: "Action waiting",
        seed: `approval:${conversationId}`,
      },
    }),
    robots,
  };
}

export default async function PublicChatOpenerPage({
  params,
}: PublicChatOpenerPageProps) {
  const { conversationId } = await params;
  const destination = `/chat/${encodeURIComponent(conversationId)}?attention=approval`;
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${destination}`} />
      <PublicChatOpener conversationId={conversationId} />
    </>
  );
}
