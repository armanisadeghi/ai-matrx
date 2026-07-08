// /education/game/host — create a multiplayer room. HostSetupImpl is a light
// "use client" leaf (no browser-only APIs at import time), so importing it here
// forms the client boundary and Next.js code-splits it automatically.
import type { Metadata } from "next";
import { HostSetupImpl } from "@/features/education/engage/components/lobby/HostSetupImpl";

export const metadata: Metadata = {
  title: "Host a Game — Study Games",
};

export default function HostGamePage() {
  return (
    <div className="h-full overflow-hidden">
      <HostSetupImpl />
    </div>
  );
}
