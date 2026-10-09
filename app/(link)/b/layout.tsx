// The app's providers around this sent link — see `components/public-link/LinkProviders.tsx` for why the
// `(link)` group's own layout carries none.
import type { ReactNode } from "react";

import { LinkProviders } from "@/components/public-link/LinkProviders";

export default function Layout({ children }: { children: ReactNode }) {
  return <LinkProviders>{children}</LinkProviders>;
}
