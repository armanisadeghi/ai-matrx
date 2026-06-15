import { createRouteMetadata } from "@/utils/route-metadata";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export const metadata = createRouteMetadata("/research", {
  title: "Research",
  description:
    "AI-powered research pipeline — gather web content, analyze sources, and synthesize reports.",
  letter: "R",
  additionalMetadata: {
    alternates: { canonical: "/research" },
    robots: { index: true, follow: true },
  },
});

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
