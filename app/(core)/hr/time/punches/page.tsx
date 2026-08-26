import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PunchRegister } from "@/features/hr/time/punches/PunchRegister";

/**
 * Route 30 — `/hr/time/punches` (SPEC-UI-IA §3.4 row 30, SPEC-TIME §2.5).
 *
 * AD-11's evidence lane. **Raw punches only** — no computed interval, no rounded figure, no total
 * appears anywhere on this page. That is the entire point of it existing separately.
 */
export const metadata = { title: "Punch register" };

export default async function PunchRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ employment?: string }>;
}) {
  const { employment } = await searchParams;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Punch register</h1>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full animate-pulse bg-card/40" aria-label="Loading the register" />
          }
        >
          <PunchRegister employmentId={employment ?? null} />
        </Suspense>
      </div>
    </>
  );
}
