// /demos/composer/all — every composer arrangement side by side, each on a real conversation.

import type { Metadata } from "next";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";
import { ComposerGallery } from "./ComposerGallery";

export const metadata: Metadata = {
  title: "All Composers",
  description: "Every chat composer size and variant on one page.",
};

export default async function ComposerGalleryPage() {
  const initialMode = await readComposerModeCookie();
  return <ComposerGallery initialMode={initialMode} />;
}
