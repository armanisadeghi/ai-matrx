// /education/progress/** — personal study analytics. A signed-out visitor has
// no study history, so the dashboard is never mounted for them: its reads are
// all per-person and would only come back refused (module-landing-pages).
import { TrendingUp } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export default async function EducationProgressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Progress"
        route="/education/progress"
        description="See your mastery, accuracy, and what to study next."
        icon={TrendingUp}
      />
    );
  }
  return children;
}
