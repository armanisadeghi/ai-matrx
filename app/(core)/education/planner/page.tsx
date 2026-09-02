// /education/planner — the AI Study Planner (P5). Server shell → the
// PlannerWorkspace client island: an AI day-by-day plan (generate + calendar
// agenda + adaptive re-plan) plus the goals list that seeds it.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toolMetadata } from "@/features/education/route-helpers";
import { PlannerWorkspace } from "@/features/education/study/planner/components/PlannerWorkspace";
import { loginHref } from "@/utils/auth/auth-destination";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata: Metadata = toolMetadata("planner");

export default async function PlannerToolPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/education/planner"));
  return <PlannerWorkspace backHref="/education" />;
}
