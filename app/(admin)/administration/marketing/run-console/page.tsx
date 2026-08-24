import type { Metadata } from "next";
import { RunConsole } from "@/features/marketing/seo/run-console/RunConsole";

/**
 * The run console at the SYSTEM tier — every brand on the platform.
 *
 * KI-049: the same component mounts at the organization and brand tiers by
 * passing a different `scope`; only this mount ships in v1. Admin gating is the
 * (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "Run console",
  description:
    "Drive the keyword-coverage engines by hand: pick brands, cap the keywords per run, watch the pass think, and read what it placed, proposed, protected and quarantined.",
};

export default function RunConsolePage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <RunConsole scope={{ tier: "system" }} />
    </div>
  );
}
