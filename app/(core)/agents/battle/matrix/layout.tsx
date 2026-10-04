import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Matrix",
  title: "Battle",
  description: "Run prompts against arms; every cell a real agent run.",
  letter: "BX",
});

export default function BattleMatrixLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
