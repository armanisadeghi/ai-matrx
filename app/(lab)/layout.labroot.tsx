// THE LAB's root layout — admitted ONLY by MATRX_PROFILE=lab (lab.aimatrx.com).
// Deliberately thin: CSS and the theme cookie, no AppShell, no Providers, no
// Redux. That is the whole reason a lab build compiles in seconds instead of
// minutes. A lab page that needs a provider imports and renders it itself, and
// pays for exactly that. Locally, `/lab/<name>` renders inside app/layout.tsx.
import "@ai-matrx/messaging/tokens.css";
import "@ai-matrx/meet/tokens.css";
import "@ai-matrx/agents/catalog/styles.css";
import "../globals.css";
import "@ai-matrx/design-system/tap-target.css";
import "@ai-matrx/design-system/tokens.css";
import "@ai-matrx/design-system/styles.css";
import { cookies } from "next/headers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "AI Matrx Lab", template: "%s — AI Matrx Lab" },
  robots: { index: false, follow: false },
};

export default async function LabRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="min-h-dvh bg-textured text-foreground antialiased">{children}</body>
    </html>
  );
}
