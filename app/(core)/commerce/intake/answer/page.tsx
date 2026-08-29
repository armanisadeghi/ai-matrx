import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { AnswerBody, AnswerHeader } from "./AnswerRouteClient";

/**
 * /commerce/intake/answer — the focused mobile answer queue over
 * `commerce.asset_unknown`: one question at a time, image-first, one-tap
 * choice/boolean answers, skip (back of queue) and defer (not a quick
 * answer). Voice dictation fills the draft for editing.
 */
export const dynamic = "force-dynamic";

export default async function IntakeAnswerPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/intake/answer");
  return (
    <>
      {/* AnswerHeader injects itself (RouteHeader owns the PageHeader portal). */}
      <AnswerHeader />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <AnswerBody />
        </div>
      </div>
    </>
  );
}
