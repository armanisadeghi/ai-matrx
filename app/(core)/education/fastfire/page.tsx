import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("fastfire");

export default function FastFireToolPage() {
  return <EduToolComingSoon slug="fastfire" />;
}
