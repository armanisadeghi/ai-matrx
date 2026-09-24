import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/markdown-studio", {
  title: "Markdown Studio",
  description:
    "Prove rich content end to end: open a real note, study guide, chat message, agent prompt, or flashcard; replay it as a stream; hear it read aloud; and compare every parser.",
  letter: "MD",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
