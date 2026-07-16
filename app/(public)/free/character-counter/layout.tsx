import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/character-counter", {
  titlePrefix: "Character Counter",
  title: "Free Tools",
  description: "A private, Unicode-aware character, word, and keyword counter with limits and reading-time estimates.",
  letter: "Cc",
});

export default function CharacterCounterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
