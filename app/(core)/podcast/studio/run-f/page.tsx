import type { Metadata } from "next";
import { ProductionBooth } from "./_components/ProductionBooth";

export const metadata: Metadata = {
  title: "Producing — Podcast Studio",
  description:
    "Watch your podcast being produced live, act by act, then play the finished episode.",
};

// Variation F · generation-progress surface (design bake-off). Self-contained
// demo that replays a mock event sequence — no backend.
export default function RunFPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <ProductionBooth />
    </div>
  );
}
