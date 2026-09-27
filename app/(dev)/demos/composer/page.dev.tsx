// /demos/composer — the AI Matrx Composer (Chat · Work · Advanced ×
// splash · page · compact) on a real conversation.
// Map: common-docs/projects/ai-matrx-composer/MAP.md.

import type { Metadata } from "next";
import { readComposerModeCookie } from "@/features/agents/components/inputs/smart-input/composer/composer-mode.server";
import { ComposerPlayground } from "./ComposerPlayground";

export const metadata: Metadata = {
  title: "Composer",
  description: "The three-mode, three-size chat composer on a real conversation.",
};

export default async function ComposerDemoPage() {
  const initialMode = await readComposerModeCookie();
  return <ComposerPlayground initialMode={initialMode} />;
}
