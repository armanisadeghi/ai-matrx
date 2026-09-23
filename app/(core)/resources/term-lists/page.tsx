import { Suspense } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { TermListsWorkspace } from "@/features/agents/term-lists/components/TermListsWorkspace";

export const metadata = createRouteMetadata("/resources/term-lists", {
  title: "Term lists",
  description: "Glossaries, pronunciations and house terms your agents use.",
  letter: "T",
});

export default function TermListsPage() {
  return (
    <Suspense fallback={null}>
      <TermListsWorkspace />
    </Suspense>
  );
}
