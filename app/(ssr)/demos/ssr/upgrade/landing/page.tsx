import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { LandingPageClient } from "./LandingPageClient";

export const metadata = createRouteMetadata("/demos/ssr", {
  titlePrefix: "Landing",
  title: "Demos",
  description: "Full pricing landing page — sections, FAQ, and final CTA.",
  letter: "DL",
});

export default function LandingDemoPage() {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/demos/ssr/upgrade"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to all demos
      </Link>
      <LandingPageClient />
    </div>
  );
}
