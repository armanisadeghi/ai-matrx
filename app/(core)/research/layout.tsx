import type { Metadata } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export const metadata: Metadata = {
  title: {
    default: "Research",
    template: "%s | AI Matrx Research",
  },
  description:
    "AI-powered research pipeline. Gather web content, analyze sources, and generate comprehensive research reports with human-in-the-loop curation.",
  alternates: {
    canonical: "/research",
  },
  openGraph: {
    title: "AI Matrx Research",
    description:
      "AI-powered research pipeline for comprehensive topic analysis. Search, scrape, analyze, and synthesize — with you in control at every step.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Matrx Research",
    description:
      "AI-powered research pipeline for comprehensive topic analysis.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {supabaseUrl && (
        <>
          <link rel="preconnect" href={supabaseUrl} />
          <link rel="dns-prefetch" href={supabaseUrl} />
        </>
      )}
      {backendUrl && (
        <>
          <link rel="preconnect" href={backendUrl} />
          <link rel="dns-prefetch" href={backendUrl} />
        </>
      )}
      {children}
    </>
  );
}
