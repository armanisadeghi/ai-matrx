import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/code", {
  title: "Code",
  description:
    "VSCode-style workspace for editing sandbox files, running commands, and collaborating with agents.",
  letter: "CD",
  additionalMetadata: {
    keywords: [
      "code editor",
      "sandbox",
      "agent coding",
      "terminal",
      "AI Matrx",
    ],
  },
});

export default function CodeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="shell-hide-dock" aria-hidden="true" />
      {children}
    </>
  );
}
