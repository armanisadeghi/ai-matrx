import type { Metadata } from "next";
import { Suspense } from "react";
import ChatLayoutShell from "./ChatLayoutShell";
import ChatLoading from "./loading";
import { generateFaviconMetadata } from "@/utils/favicon-utils";

// Public layout has no title template — include full brand name here.
export const metadata: Metadata = generateFaviconMetadata("/chat", {
  title: "Chat — AI Matrx",
  description: "AI-powered chat interface",
  openGraph: {
    title: "Chat | AI Matrx",
    description: "AI-powered chat interface",
    type: "website",
    siteName: "AI Matrx",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chat | AI Matrx",
    description: "AI-powered chat interface",
  },
});

export default function PublicChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ChatLoading />}>
      <ChatLayoutShell>{children}</ChatLayoutShell>
    </Suspense>
  );
}
