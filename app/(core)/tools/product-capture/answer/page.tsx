import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { AnswerBody, AnswerHeader } from "./AnswerRouteClient";

/**
 * /tools/product-capture/answer — the focused mobile quick-answer queue:
 * one AI question at a time, image-first, with answer / skip (back of the
 * queue) / "not a quick answer" (defer out of this flow). Voice answers
 * transcribe in place.
 */
export const dynamic = "force-dynamic";

export default async function ProductAnswerPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/product-capture/answer");
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
