// The authed creator manage surface (/education/creator). Claim a handle, edit
// your public identity, feature YouTube videos + free tools + classes, publish.
// Signed-in only; every creator_* RPC is gated on auth.uid() owning the row.
// noindex — the PUBLIC page is /c/[handle].

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CreatorDashboard } from "@/features/education/creators/components/CreatorDashboard";

export const metadata: Metadata = {
  title: "Creator page · AI Matrx Education",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CreatorManagePage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent("/education/creator")}`);

  return <CreatorDashboard />;
}
