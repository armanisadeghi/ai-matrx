import type { ReactNode } from "react";

import { SocialsShell } from "@/features/marketing/social/components/SocialsShell";

/** The Socials section: one header row (tabs + Track account) over every tab. */
export default function BrandSocialsLayout({ children }: { children: ReactNode }) {
  return <SocialsShell>{children}</SocialsShell>;
}
