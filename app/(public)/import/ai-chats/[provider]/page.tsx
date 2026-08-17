import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceGuidePage } from "@/features/source-onboarding/components/SourceGuidePage";
import { aiChatsGallery } from "@/features/source-onboarding/galleries/ai-chats";

function findProvider(key: string) {
  return aiChatsGallery.providers.find((p) => p.key === key) ?? null;
}

export function generateStaticParams() {
  return aiChatsGallery.providers.map((p) => ({ provider: p.key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider: key } = await params;
  const provider = findProvider(key);
  if (!provider) return { title: "Import your AI chats | AI Matrx" };
  return {
    title: `How to export your ${provider.name} chat history | AI Matrx`,
    description: `Step-by-step guide to exporting your ${provider.name} conversations — then turn your own judgment into a Rulebook on AI Matrx.`,
  };
}

export default async function ProviderGuideRoute({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider: key } = await params;
  const provider = findProvider(key);
  if (!provider) notFound();
  return <SourceGuidePage gallery={aiChatsGallery} provider={provider} />;
}
