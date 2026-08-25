import type { Metadata } from "next";
import { PublicExposureConsole } from "@/features/admin/public-exposure/PublicExposureConsole";

/**
 * Public exposure scoreboard.
 *
 * Unlike the dead-ends / lint-debt boards, this one reads LIVE rather than a
 * committed snapshot — the question is "can a stranger reach this right now",
 * and a snapshot can be stale in exactly the way that matters. It is one cheap
 * catalog query behind a super-admin-gated RPC.
 *
 * Admin gating is the (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "Public exposure",
  description:
    "Every table a signed-out visitor can reach, judged against the one declaration list — undeclared exposure fails the release gate.",
};

export default function PublicExposurePage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] bg-textured">
      <PublicExposureConsole />
    </div>
  );
}
